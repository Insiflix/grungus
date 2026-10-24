import { mkdirSync } from "node:fs";
import type { BrowserWindow, IpcMain } from "electron";
import { assertTrustedAppSender } from "./ipcSecurity.js";
import type { RotatingLog } from "./logging.js";

export function registerLoggingIpc(ipc: IpcMain, getWindow: () => BrowserWindow | null, trusted: (url: string) => boolean, log: RotatingLog, openPath: (directory: string) => Promise<string>): void {
  ipc.handle("logs:path", event => {
    assertTrustedAppSender(event, getWindow(), trusted);
    return log.directory;
  });
  ipc.handle("logs:open", async event => {
    assertTrustedAppSender(event, getWindow(), trusted);
    log.flush();
    mkdirSync(log.directory, { recursive: true, mode: 0o700 });
    const error = await openPath(log.directory);
    if (error) throw new Error(`Unable to open log folder: ${error}`);
  });
}
