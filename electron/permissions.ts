import type { BrowserWindow, Session } from "electron";

/** Keep permission requests limited to the app and its bundled call frame. */
export function allowsAppPermission(permission: string, requestingUrl: string, packaged: boolean, mainFrame: boolean): boolean {
  try {
    const url = new URL(requestingUrl);
    const trusted = packaged
      ? url.protocol === "grungus-app:" && url.host === "client"
      : url.origin === "http://127.0.0.1:5173";
    if (!trusted) return false;
    const appPage = url.pathname === "" || url.pathname === "/" || url.pathname === "/index.html";
    const callPage = url.pathname === "/element-call/index.html";
    if (permission === "notifications" || permission === "clipboard-sanitized-write") return appPage && mainFrame;
    return (appPage || callPage) && ["media", "display-capture", "speaker-selection", "fullscreen"].includes(permission);
  } catch { return false; }
}
export function configureAppPermissions(session: Session, getWindow: () => BrowserWindow | null, packaged: boolean): void {
  session.setPermissionCheckHandler((contents, permission, origin, details) => {
    const window = getWindow();
    if (!window || !allowsAppPermission("notifications", window.webContents.getURL(), packaged, true)) return false;
    // Chromium can check notification permission without an associated WebContents.
    const originCheck = contents === null && permission === "notifications" && !details.requestingUrl;
    if (contents !== window.webContents && !originCheck) return false;
    return allowsAppPermission(permission, details.requestingUrl || origin, packaged, originCheck || details.isMainFrame);
  });
  session.setPermissionRequestHandler((contents, permission, callback, details) => {
    const window = getWindow();
    callback(Boolean(window && contents === window.webContents &&
      allowsAppPermission("notifications", window.webContents.getURL(), packaged, true) &&
      allowsAppPermission(permission, details.requestingUrl, packaged, details.isMainFrame)));
  });
}
