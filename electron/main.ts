import { app, BrowserWindow, ipcMain, safeStorage, shell, session } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  PersistedMatrixSession,
  SessionStoreResult,
} from "./shared/session.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROTOCOL = "grungus-matrix";
const SESSION_FILE = "matrix-session.bin";
let mainWindow: BrowserWindow | null = null;
let pendingAuthCallback: string | null = null;

function isAuthCallback(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === `${PROTOCOL}:` && url.hostname === "auth";
  } catch {
    return false;
  }
}

function consumeProtocolArg(argv: string[]): void {
  const callback = argv.find(isAuthCallback);
  if (!callback) return;

  pendingAuthCallback = callback;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("matrix-auth:callback", callback);
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
}

function sessionFilePath(): string {
  return path.join(app.getPath("userData"), SESSION_FILE);
}

function isPersistedSession(value: unknown): value is PersistedMatrixSession {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.homeserverUrl === "string" &&
    typeof candidate.serverName === "string" &&
    typeof candidate.accessToken === "string" &&
    typeof candidate.userId === "string" &&
    typeof candidate.deviceId === "string" &&
    (candidate.refreshToken === undefined ||
      typeof candidate.refreshToken === "string")
  );
}

async function saveSession(
  value: PersistedMatrixSession,
): Promise<SessionStoreResult> {
  if (!isPersistedSession(value)) {
    throw new Error("Invalid Matrix session payload");
  }
  if (!safeStorage.isEncryptionAvailable()) {
    return {
      persisted: false,
      reason: "OS credential encryption is unavailable; the session was not written to disk.",
    };
  }

  const destination = sessionFilePath();
  const temporary = `${destination}.tmp`;
  const encrypted = safeStorage.encryptString(JSON.stringify(value));
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(temporary, encrypted, { mode: 0o600 });
  await fs.rename(temporary, destination);
  return { persisted: true };
}

async function loadSession(): Promise<PersistedMatrixSession | null> {
  if (!safeStorage.isEncryptionAvailable()) return null;

  try {
    const encrypted = await fs.readFile(sessionFilePath());
    const value: unknown = JSON.parse(safeStorage.decryptString(encrypted));
    return isPersistedSession(value) ? value : null;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return null;
    console.warn("Unable to restore the encrypted Matrix session", error);
    return null;
  }
}

async function removeSession(): Promise<void> {
  try {
    await fs.unlink(sessionFilePath());
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

function isTrustedRendererUrl(url: string): boolean {
  if (app.isPackaged) return url.startsWith("file://");
  return url.startsWith("http://127.0.0.1:5173");
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: "#090d18",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) void shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!isTrustedRendererUrl(url)) event.preventDefault();
  });
  mainWindow.webContents.on("did-finish-load", () => {
    if (pendingAuthCallback) {
      mainWindow?.webContents.send("matrix-auth:callback", pendingAuthCallback);
      pendingAuthCallback = null;
    }
  });
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  const developmentUrl = process.env.VITE_DEV_SERVER_URL;
  if (developmentUrl) void mainWindow.loadURL(developmentUrl);
  else void mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
}

function registerIpc(): void {
  ipcMain.handle("matrix-session:load", () => loadSession());
  ipcMain.handle(
    "matrix-session:save",
    (_event, value: PersistedMatrixSession) => saveSession(value),
  );
  ipcMain.handle("matrix-session:remove", () => removeSession());
  ipcMain.handle("matrix-auth:open-external", async (_event, value: unknown) => {
    if (typeof value !== "string") throw new Error("Invalid URL");
    const url = new URL(value);
    if (url.protocol !== "https:") {
      throw new Error("Only HTTPS authentication URLs may be opened");
    }
    await shell.openExternal(url.toString());
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => consumeProtocolArg(argv));
  app.on("open-url", (event, url) => {
    event.preventDefault();
    consumeProtocolArg([url]);
  });

  if (app.isPackaged) {
    app.setAsDefaultProtocolClient(PROTOCOL);
  } else {
    app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [
      path.resolve(process.argv[1]),
    ]);
  }

  consumeProtocolArg(process.argv);
  void app.whenReady().then(() => {
    session.defaultSession.setPermissionRequestHandler(
      (_webContents, _permission, callback) => callback(false),
    );
    registerIpc();
    createWindow();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}



