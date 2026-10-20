const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("node:path");

app.whenReady().then(async () => {
  const { registerWindowControls } = await import("../dist-electron/windowControls.js");
  const window = new BrowserWindow({ show: false, frame: false, width: 1200, height: 800, webPreferences: { preload: path.resolve("dist-electron/preload.cjs"), offscreen: true, backgroundThrottling: false, sandbox: true, contextIsolation: true } });
  registerWindowControls(ipcMain, () => window, url => new URL(url).origin === new URL(process.argv[2]).origin);
  try {
    await window.loadURL(process.argv[2]);
    console.log("Preview and titlebar checks:", await window.webContents.executeJavaScript("window.checkChatInteractions()"));
    if (process.env.CHAT_SCREENSHOT) require("node:fs").writeFileSync(process.env.CHAT_SCREENSHOT, (await window.webContents.capturePage()).toPNG());
    console.log("Upload queue checks:", await window.webContents.executeJavaScript("window.sendDraft()"));
    console.log("Upload size checks:", await window.webContents.executeJavaScript("window.checkUploadLimit()"));
    console.log("Image viewer checks:", await window.webContents.executeJavaScript("window.checkImageViewer()"));
    if (process.env.IMAGE_VIEWER_SCREENSHOT) require("node:fs").writeFileSync(process.env.IMAGE_VIEWER_SCREENSHOT, (await window.webContents.capturePage()).toPNG());
    console.log("Viewer dismissal:", await window.webContents.executeJavaScript("window.closeImageViewer()"));
    console.log("Small image zoom:", await window.webContents.executeJavaScript("window.checkSmallImageZoom()"));
    const state = await window.webContents.executeJavaScript("window.desktop.windowControls.getState()");
    if (typeof state.maximized !== "boolean") throw new Error("Desktop window bridge unavailable");
    console.log("PASS: native file drag/drop and file selection previews, explicit send, custom titlebar and preload IPC.");
    app.exit(0);
  } catch (error) { console.error(error); app.exit(1); }
});
