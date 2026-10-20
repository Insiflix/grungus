import type { BrowserWindow, IpcMainInvokeEvent } from "electron";

export function assertTrustedAppSender(event: IpcMainInvokeEvent, window: BrowserWindow | null, trustedOrigin: (url: string) => boolean): void {
  if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || !event.senderFrame || !trustedOrigin(event.senderFrame.url)) throw new Error("Untrusted desktop request");
  const url = new URL(event.senderFrame.url);
  if (!["/", "/index.html"].includes(url.pathname)) throw new Error("Desktop requests require the main application page");
}
