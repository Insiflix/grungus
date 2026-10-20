import type { BrowserWindow, IpcMain } from "electron";

export function registerWindowControls(ipc: IpcMain, getWindow: () => BrowserWindow | null, trustedUrl: (url: string) => boolean) {
  const commands = {
    "window:state": (window: BrowserWindow) => ({ maximized: window.isMaximized() }),
    "window:minimize": (window: BrowserWindow) => window.minimize(),
    "window:toggle-maximize": (window: BrowserWindow) => { if (window.isMaximized()) window.unmaximize(); else window.maximize(); },
    "window:close": (window: BrowserWindow) => window.close(),
  };
  for (const [channel, action] of Object.entries(commands)) {
    ipc.handle(channel, event => {
      const window = getWindow();
      if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || !trustedUrl(event.senderFrame.url)) throw new Error("Untrusted window control request");
      return action(window);
    });
  }
}
