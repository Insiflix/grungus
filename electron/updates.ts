import { app, BrowserWindow, dialog } from "electron";
import electronUpdater from "electron-updater";

const { autoUpdater } = electronUpdater;
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

/** Use the public GitHub feed embedded by electron-builder, never a client token. */
export function startAutoUpdates(getWindow: () => BrowserWindow | null): void {
  if (!app.isPackaged || process.defaultApp) return;
  if (process.platform !== "win32" && !(process.platform === "linux" && process.env.APPIMAGE)) return;

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
