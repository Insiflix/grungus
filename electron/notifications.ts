import { Notification, nativeImage, type BrowserWindow, type IpcMain } from "electron";
import { assertTrustedAppSender } from "./ipcSecurity.js";
import type { DesktopNotification } from "./shared/session.js";

export function registerNotifications(ipc: IpcMain, getWindow: () => BrowserWindow | null, trustedUrl: (url: string) => boolean, icon: string) {
  const active = new Set<Notification>();
  ipc.handle("notifications:supported", event => {
    assertTrustedAppSender(event, getWindow(), trustedUrl);
    return Notification.isSupported();
  });
  ipc.handle("notifications:show", (event, value: DesktopNotification) => {
    const window = getWindow();
    assertTrustedAppSender(event, window, trustedUrl);
    if (!value || typeof value.title !== "string" || !value.title || value.title.length > 512 ||
        typeof value.body !== "string" || value.body.length > 4096 || typeof value.silent !== "boolean" ||
        (value.roomId !== undefined && (typeof value.roomId !== "string" || value.roomId.length > 2048))) throw new Error("Invalid notification");
    if (!Notification.isSupported()) throw new Error("Desktop notifications are unavailable on this system.");
    let notificationIcon: string | Electron.NativeImage = icon;
    if (value.iconDataUrl !== undefined) {
      if (typeof value.iconDataUrl !== "string" || value.iconDataUrl.length > 350_000 || !/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(value.iconDataUrl)) throw new Error("Invalid notification icon");
      const bytes = Buffer.from(value.iconDataUrl.slice("data:image/png;base64,".length), "base64");
      if (bytes.length < 24 || bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" ||
          bytes.readUInt32BE(16) < 1 || bytes.readUInt32BE(16) > 256 || bytes.readUInt32BE(20) < 1 || bytes.readUInt32BE(20) > 256) throw new Error("Invalid notification icon");
      notificationIcon = nativeImage.createFromBuffer(bytes);
      if (notificationIcon.isEmpty()) throw new Error("Invalid notification icon");
    }
    const notification = new Notification({ title: value.title, body: value.body, silent: value.silent, icon: notificationIcon });
    active.add(notification);
    // Keep the object alive for click events, while bounding retained notifications.
    if (active.size > 100) { const oldest = active.values().next().value!; active.delete(oldest); oldest.close(); }
    notification.once("click", () => {
      active.delete(notification);
      if (!window || window.isDestroyed() || window.webContents.isDestroyed() || !trustedUrl(window.webContents.getURL())) return;
      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();
      if (value.roomId) window.webContents.send("notifications:open-room", value.roomId);
      notification.close();
    });
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { reject(new Error("The system did not confirm notification delivery. Check your system notification settings.")); }, 10000);
      const finish = () => clearTimeout(timer);
      notification.once("show", () => { finish(); resolve(); });
      notification.once("failed", (_event, error) => { finish(); active.delete(notification); reject(new Error(`Unable to show notification: ${error}`)); });
      notification.once("close", () => { active.delete(notification); });
      try { notification.show(); } catch (error) { finish(); active.delete(notification); reject(error); }
    });
  });
}
