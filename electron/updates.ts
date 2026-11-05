import { app, BrowserWindow, dialog } from "electron";
import electronUpdater from "electron-updater";
import type { IpcMain } from "electron";
import { assertTrustedAppSender } from "./ipcSecurity.js";

const { autoUpdater } = electronUpdater;
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

function updatesSupported(): boolean {
  return app.isPackaged && !process.defaultApp && (process.platform === "win32" || (process.platform === "linux" && Boolean(process.env.APPIMAGE)));
}

export function registerUpdateIpc(ipc: IpcMain, getWindow: () => BrowserWindow | null, trusted: (url: string) => boolean): void {
  ipc.handle("updates:check", async event => {
    assertTrustedAppSender(event, getWindow(), trusted);
    if (!updatesSupported()) return "Automatic updates are available in installed Windows and Linux AppImage builds.";
    const result = await autoUpdater.checkForUpdates();
    if (!result) throw new Error("The update service is unavailable. Please try again later.");
    return result.isUpdateAvailable
      ? `Grungus ${result.updateInfo.version} is available and downloading. You will be prompted when it is ready to install.`
      : "You are up to date.";
  });
}

/** Use the public GitHub feed embedded by electron-builder, never a client token. */
export function startAutoUpdates(getWindow: () => BrowserWindow | null): void {
  if (!updatesSupported()) return;

  autoUpdater.logger = console;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowDowngrade = false;
  // Preview builds receive previews; stable installations stay on stable releases.
  autoUpdater.allowPrerelease = app.getVersion().split("+")[0].includes("-");
  autoUpdater.on("error", error => console.warn("Unable to update Grungus", error));
  autoUpdater.on("update-downloaded", async info => {
    const options = {
      type: "info" as const,
      title: "Grungus-Update",
      message: `Grungus ${info.version} ist bereit.`,
      detail: "Jetzt neu starten und installieren? Andernfalls wird das Update beim Beenden installiert.",
      buttons: ["Neu starten", "Später"],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
    };
    try {
      const window = getWindow();
      const result = window && !window.isDestroyed()
        ? await dialog.showMessageBox(window, options)
        : await dialog.showMessageBox(options);
      if (result.response === 0) autoUpdater.quitAndInstall();
    } catch (error) {
      console.warn("Unable to show the Grungus update dialog", error);
    }
  });

  const check = () => {
    void autoUpdater.checkForUpdates().catch(error => console.warn("Unable to check for Grungus updates", error));
  };
  check();
  const timer = setInterval(check, CHECK_INTERVAL_MS);
  timer.unref();
  app.once("before-quit", () => clearInterval(timer));
}
