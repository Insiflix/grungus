import type { DesktopNotification } from "../../../electron/shared/session";

export function notificationsAvailable(): boolean {
  return Boolean(window.desktop?.notifications) || typeof Notification !== "undefined";
}

export async function enableNotifications(): Promise<void> {
  if (window.desktop?.notifications) {
    if (!await window.desktop.notifications.isSupported()) throw new Error("Desktop notifications are unavailable on this system.");
    return;
  }
  if (typeof Notification === "undefined" || (Notification.permission !== "granted" && await Notification.requestPermission() !== "granted")) {
    throw new Error("Notification permission was not granted. Allow notifications in your browser or system settings, then try again.");
  }
}

export async function showNotification(value: DesktopNotification): Promise<void> {
  if (window.desktop?.notifications) return window.desktop.notifications.show({ ...value, title: value.title.slice(0, 512), body: value.body.slice(0, 4096) });
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const notification = new Notification(value.title, { body: value.body, silent: value.silent, icon: "./grungus.png" });
  notification.onclick = () => {
    window.focus();
    if (value.roomId) window.dispatchEvent(new CustomEvent("grungus:open-room", { detail: value.roomId }));
    notification.close();
  };
}
