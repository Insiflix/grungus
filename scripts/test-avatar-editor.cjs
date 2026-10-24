const { app, BrowserWindow } = require("electron");
const { writeFileSync, mkdirSync } = require("node:fs");
app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, width: 900, height: 800, webPreferences: { offscreen: true, backgroundThrottling: false, sandbox: true, contextIsolation: true } });
  try {
    await window.loadURL(process.argv[2]);
    console.log("Avatar layout:", await window.webContents.executeJavaScript("window.prepareAvatarEditor()"));
    mkdirSync("artifacts/avatar-editor", { recursive: true });
    writeFileSync("artifacts/avatar-editor/preview.png", (await window.webContents.capturePage()).toPNG());
    const point = await window.webContents.executeJavaScript("window.avatarDragPoints()");
    window.webContents.sendInputEvent({ type: "mouseDown", x: point.x, y: point.y, button: "left", clickCount: 1 });
    window.webContents.sendInputEvent({ type: "mouseMove", x: point.x + point.dx, y: point.y, button: "left" });
    window.webContents.sendInputEvent({ type: "mouseUp", x: point.x + point.dx, y: point.y, button: "left", clickCount: 1 });
    console.log("Avatar crop:", await window.webContents.executeJavaScript("window.checkAvatarExport()"));
    console.log("Avatar cancellation:", await window.webContents.executeJavaScript("window.checkAvatarCancel()"));
    app.exit(0);
  } catch (error) { console.error(error); app.exit(1); }
});
