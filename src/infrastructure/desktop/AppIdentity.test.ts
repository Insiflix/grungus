import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { expect, it, vi } from "vitest";

// Exercise the real startup code with Windows integration mocked, so tests never
// write shortcuts, register protocols or access a real Matrix profile.
function startup(packaged: boolean, defaultApp = false) {
  const paths: Record<string, string> = {
    appData: "C:\\Profiles\\AppData\\Roaming",
    userData: "C:\\Profiles\\AppData\\Roaming\\grungus-matrix",
    sessionData: "C:\\Profiles\\AppData\\Roaming\\grungus-matrix",
  };
  let ready!: () => Promise<void>;
  let lockedProfile = "";
  const stop = new Error("Stop before renderer initialization");
  const app = {
    isPackaged: packaged,
    toastActivatorCLSID: "test-dev-clsid",
    setName: vi.fn(), setAppUserModelId: vi.fn(),
    getPath: (name: string) => paths[name],
    setPath: vi.fn((name: string, value: string) => { paths[name] = value; }),
    getAppPath: () => "G:\\project",
    requestSingleInstanceLock: vi.fn(() => { lockedProfile = paths.userData; return true; }),
    setAsDefaultProtocolClient: vi.fn(), on: vi.fn(),
    whenReady: () => ({ then: (callback: () => Promise<void>) => { ready = callback; } }),
  };
  const shell = {
    // Existing release shortcuts must survive dev startup and legacy cleanup.
    readShortcutLink: vi.fn(() => ({ target: "C:\\Installed\\Grungus.exe", appUserModelId: "dev.grungus.matrix" })),
    writeShortcutLink: vi.fn(() => true),
  };
  const fs = {
    readFile: vi.fn(async () => Buffer.from("test-icon")),
    mkdir: vi.fn(async () => {}), writeFile: vi.fn(async () => {}), unlink: vi.fn(),
  };
  const source = stripTypeScriptTypes(readFileSync("electron/main.ts", "utf8"))
    .replace(/^import [\s\S]*?;$/gm, "")
    .replace("import.meta.url", JSON.stringify("file:///G:/project/electron/main.ts"));
  runInNewContext(source, {
    app, shell, fs, path: path.win32, mkdirSync: vi.fn(), Buffer, console,
    process: { defaultApp, platform: "win32", argv: ["electron.exe", "G:\\project"], execPath: "G:\\runtime\\grungus-dev.exe" },
    fileURLToPath: () => "G:\\project\\electron\\main.ts",
    createHash: () => ({ update: () => ({ digest: () => "1234567890abcdef" }) }),
    protocol: { registerSchemesAsPrivileged: vi.fn(), handle: () => { throw stop; } },
    SessionOperationQueue: class {}, SsoCallback: class {},
  });
  return { app, shell, fs, paths, lockedProfile, ready: () => expect(ready()).rejects.toBe(stop) };
}

it.each([false, true])("isolates development from installed shortcuts, protocols and storage (branded runtime: %s)", async branded => {
  const state = startup(branded, branded);
  expect(state.app.setName).toHaveBeenCalledWith("Grungus Dev");
  expect(state.app.setAppUserModelId).toHaveBeenCalledWith("dev.grungus.matrix.development");
  const profile = path.win32.join(state.paths.appData, "grungus-matrix-dev");
  expect(state.paths.userData).toBe(profile);
  expect(state.paths.sessionData).toBe(profile);
  expect(state.lockedProfile).toBe(profile);
  expect(state.app.setAsDefaultProtocolClient).toHaveBeenCalledExactlyOnceWith(
    "grungus-matrix-dev", "G:\\runtime\\grungus-dev.exe", ["G:\\project"],
  );
  await state.ready();
  expect(state.shell.writeShortcutLink).toHaveBeenCalledExactlyOnceWith(
    path.win32.join(state.paths.appData, "Microsoft/Windows/Start Menu/Programs/Grungus Dev.lnk"),
    "create", expect.objectContaining({ description: "Grungus Dev", appUserModelId: "dev.grungus.matrix.development" }),
  );
  expect(state.fs.unlink).not.toHaveBeenCalled();
});

it("preserves the installed identity and profile and never rewrites its installer shortcut", async () => {
  const state = startup(true);
  expect(state.app.setName).not.toHaveBeenCalled();
  expect(state.app.setPath).not.toHaveBeenCalled();
  expect(state.lockedProfile).toBe(state.paths.userData);
  expect(state.app.setAppUserModelId).toHaveBeenCalledWith("dev.grungus.matrix");
  expect(state.app.setAsDefaultProtocolClient).toHaveBeenCalledExactlyOnceWith("grungus-matrix");
  await state.ready();
  expect(state.shell.writeShortcutLink).not.toHaveBeenCalled();
  expect(state.fs.unlink).not.toHaveBeenCalled();
});
