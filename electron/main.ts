import { writeClipboardImage } from "./imageClipboard.js";
import { registerNotifications } from "./notifications.js";
import { registerWindowControls } from "./windowControls.js";
import { DesktopCaptureBroker } from "./desktopCapture.js";
import { configureAppPermissions, allowsAppPermission } from "./permissions.js";
import { assertTrustedAppSender } from "./ipcSecurity.js";
import { secureStorageAvailable, isPersistedSession, SessionOperationQueue } from "./sessionSecurity.js";
import { secureMessageUrl, secureExternalUrl } from "./shared/urls.js";
import { app, BrowserWindow, clipboard, ipcMain, safeStorage, shell, session, protocol, net, desktopCapturer } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type {
  PersistedMatrixSession,
  SessionStoreResult,
} from "./shared/session.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Keep development windows separate from installed/pinned application groups.
const APP_ID = app.isPackaged ? "dev.grungus.matrix" : "dev.grungus.matrix.development";
if (process.platform === "win32") app.setAppUserModelId(APP_ID);

protocol.registerSchemesAsPrivileged([{ scheme: "grungus-app", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);

const PROTOCOL = "grungus-matrix";
const SESSION_FILE = "matrix-session.bin";
let desktopCapture: DesktopCaptureBroker | null = null;
let mainWindow: BrowserWindow | null = null;
let pendingAuthCallback: string | null = null;
const sessionOperations = new SessionOperationQueue();

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

async function saveSession(
  value: PersistedMatrixSession,
): Promise<SessionStoreResult> {
  if (!isPersistedSession(value)) {
    throw new Error("Invalid Matrix session payload");
  }
  if (!secureStorageAvailable(safeStorage, process.platform)) {
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
  if (!secureStorageAvailable(safeStorage, process.platform)) return null;

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
  try { const parsed = new URL(url); return app.isPackaged ? (parsed.protocol === "grungus-app:" && parsed.hostname === "client") : parsed.origin === "http://127.0.0.1:5173"; } catch { return false; }
}

function createWindow(): void {
  const assetDirectory = path.join(app.getAppPath(), app.isPackaged ? "dist" : "public");
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: "#090d18",
    icon: path.join(assetDirectory, process.platform === "win32" ? "grungus.ico" : "grungus.png"),
    frame: false,
    autoHideMenuBar: true,
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

  if (process.platform === "win32") mainWindow.setAppDetails({
    appId: APP_ID,
    appIconPath: app.isPackaged ? process.execPath : path.join(assetDirectory, "grungus.ico"),
    appIconIndex: 0,
    relaunchDisplayName: "Grungus Matrix",
    relaunchCommand: app.isPackaged ? `"${process.execPath}"` : `"${process.execPath}" "${app.getAppPath()}"`,
  });
  mainWindow.removeMenu();
  const publishWindowState = () => mainWindow?.webContents.send("window:state-changed", { maximized: mainWindow.isMaximized() });
  mainWindow.on("maximize", publishWindowState);
  mainWindow.on("unmaximize", publishWindowState);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try { void shell.openExternal(secureMessageUrl(url)).catch(() => undefined); } catch { /* Unsupported external scheme. */ }
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    desktopCapture?.cancel();
    if (!isTrustedRendererUrl(url) || !["/", "/index.html"].includes(new URL(url).pathname)) event.preventDefault();
  });
  mainWindow.webContents.on("will-frame-navigate", event => {
    if (!event.isMainFrame && !allowsAppPermission("media", event.url, app.isPackaged, false)) event.preventDefault();
  });
  mainWindow.webContents.on("did-finish-load", () => {
    if (pendingAuthCallback) {
      mainWindow?.webContents.send("matrix-auth:callback", pendingAuthCallback);
      pendingAuthCallback = null;
    }
  });
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("closed", () => {
    desktopCapture?.cancel();
    mainWindow = null;
  });

  const developmentUrl = process.env.VITE_DEV_SERVER_URL;
  if (developmentUrl) void mainWindow.loadURL(developmentUrl);
  else void mainWindow.loadURL("grungus-app://client/index.html");
}

function registerIpc(): void {
  registerNotifications(ipcMain, () => mainWindow, isTrustedRendererUrl, path.join(app.getAppPath(), app.isPackaged ? "dist" : "public", "grungus.png"));
  registerWindowControls(ipcMain, () => mainWindow, isTrustedRendererUrl);
  ipcMain.handle("clipboard:write-text", (event, text: unknown) => {
    if (event.sender !== mainWindow?.webContents || event.senderFrame !== mainWindow.webContents.mainFrame || !isTrustedRendererUrl(event.senderFrame.url)) throw new Error("Untrusted clipboard request");
    if (typeof text !== "string") throw new Error("Invalid clipboard text");
    return clipboard.writeText(text);
  });
  ipcMain.handle("clipboard:write-image", async (event, bytes: unknown) => {
    assertTrustedAppSender(event, mainWindow, isTrustedRendererUrl);
    await writeClipboardImage(bytes);
  });
  ipcMain.handle("desktop-capture:respond", (event, requestId: unknown, sourceId: unknown, audio: unknown) => {
    if (event.sender !== mainWindow?.webContents || event.senderFrame !== mainWindow.webContents.mainFrame || !isTrustedRendererUrl(event.senderFrame.url)) throw new Error("Untrusted capture response");
    if (typeof requestId !== "string" || (sourceId !== null && typeof sourceId !== "string") || typeof audio !== "boolean") throw new Error("Invalid capture response");
    desktopCapture?.respond(requestId, sourceId, audio);
  });
  ipcMain.handle("matrix-session:load", event => { assertTrustedAppSender(event, mainWindow, isTrustedRendererUrl); return sessionOperations.run(loadSession); });
  ipcMain.handle(
    "matrix-session:save",
    (event, value: PersistedMatrixSession) => { assertTrustedAppSender(event, mainWindow, isTrustedRendererUrl); return sessionOperations.run(() => saveSession(value)); },
  );
  ipcMain.handle("matrix-session:remove", event => { assertTrustedAppSender(event, mainWindow, isTrustedRendererUrl); return sessionOperations.run(removeSession); });
  ipcMain.handle("matrix-auth:open-external", async (event, value: unknown) => {
    assertTrustedAppSender(event, mainWindow, isTrustedRendererUrl);
    if (typeof value !== "string") throw new Error("Invalid URL");
    await shell.openExternal(secureExternalUrl(value));
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
    if (process.platform === "win32" && !app.isPackaged) {
      // Windows toast delivery requires a Start Menu shortcut matching the AUMID.
      const shortcut = path.join(app.getPath("appData"), "Microsoft", "Windows", "Start Menu", "Programs", "Grungus Matrix Development.lnk");
      if (!shell.writeShortcutLink(shortcut, "create", {
        target: process.execPath, args: `"${app.getAppPath()}"`, cwd: app.getAppPath(),
        description: "Grungus Matrix development", appUserModelId: APP_ID,
        toastActivatorClsid: app.toastActivatorCLSID,
        icon: path.join(app.getAppPath(), "public", "grungus.ico"), iconIndex: 0,
      })) console.warn("Unable to register the development notification shortcut");
    }
    protocol.handle("grungus-app", async (request) => {
      const url = new URL(request.url);
      const root = path.resolve(__dirname, "../dist");
      const destination = path.resolve(root, "." + decodeURIComponent(url.pathname));
      if (!["client", "call"].includes(url.hostname) || (url.hostname === "call" && !url.pathname.startsWith("/element-call/")) || !destination.startsWith(root + path.sep)) return new Response("Forbidden", { status: 403 });
      return net.fetch(pathToFileURL(destination).href);
    });
    desktopCapture = new DesktopCaptureBroker({
      platform: process.platform,
      getSources: () => desktopCapturer.getSources({ types: ["screen", "window"], thumbnailSize: { width: 320, height: 180 }, fetchWindowIcons: true }),
      isTrusted: request => Boolean(mainWindow && request.frame && request.frame.top === mainWindow.webContents.mainFrame && allowsAppPermission("display-capture", request.frame.url, app.isPackaged, request.frame === mainWindow.webContents.mainFrame)),
      notify: request => mainWindow?.webContents.send("desktop-capture:request", request),
      dismiss: id => mainWindow?.webContents.send("desktop-capture:dismiss", id),
    });
    session.defaultSession.setDisplayMediaRequestHandler((request, callback) => { void desktopCapture!.request(request, callback); });
    app.on("before-quit", event => {
      desktopCapture?.cancel();
    });
    configureAppPermissions(session.defaultSession, () => mainWindow, app.isPackaged);
    if (process.platform === "darwin" && !app.isPackaged) {
      app.dock?.setIcon(path.join(app.getAppPath(), "public", "grungus.png"));
    }
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



