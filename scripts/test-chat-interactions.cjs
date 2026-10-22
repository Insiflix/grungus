const { app, BrowserWindow, ipcMain, clipboard, nativeImage } = require("electron");
const path = require("node:path");

app.whenReady().then(async () => {
  const { registerWindowControls } = await import("../dist-electron/windowControls.js");
  const window = new BrowserWindow({ show: false, frame: false, width: 1200, height: 800, webPreferences: { preload: path.resolve("dist-electron/preload.cjs"), offscreen: true, backgroundThrottling: false, sandbox: true, contextIsolation: true } });
  registerWindowControls(ipcMain, () => window, url => new URL(url).origin === new URL(process.argv[2]).origin);
  const { writeClipboardImage } = await import("../dist-electron/imageClipboard.js");
  const registerImageClipboard = () => ipcMain.handle("clipboard:write-image", async (event, bytes) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error("Untrusted test image request");
    await writeClipboardImage(bytes);
  });
  try {
    await window.loadURL(process.argv[2]);
    window.webContents.debugger.attach("1.3");
    await window.webContents.debugger.sendCommand("Emulation.setFocusEmulationEnabled", { enabled: true });
    console.log("Preview and titlebar checks:", await window.webContents.executeJavaScript("window.checkChatInteractions()"));
    if (process.env.CHAT_SCREENSHOT) require("node:fs").writeFileSync(process.env.CHAT_SCREENSHOT, (await window.webContents.capturePage()).toPNG());
    console.log("Upload queue checks:", await window.webContents.executeJavaScript("window.sendDraft()"));
    const pasteImage = new Uint8Array(await window.webContents.executeJavaScript(`fetch('/grungus.png').then(response => response.arrayBuffer()).then(buffer => Array.from(new Uint8Array(buffer)))`));
    await writeClipboardImage(pasteImage);
    await window.webContents.executeJavaScript(`document.querySelector('textarea').focus()`);
    window.webContents.paste();
    console.log("Clipboard paste:", await window.webContents.executeJavaScript("window.checkClipboardPaste()"));
    console.log("Upload size checks:", await window.webContents.executeJavaScript("window.checkUploadLimit()"));
    console.log("Image skeletons:", await window.webContents.executeJavaScript("window.checkImageSkeletons()"));
    console.log("Image viewer checks:", await window.webContents.executeJavaScript("window.checkImageViewer()"));
    if (process.env.IMAGE_VIEWER_SCREENSHOT) require("node:fs").writeFileSync(process.env.IMAGE_VIEWER_SCREENSHOT, (await window.webContents.capturePage()).toPNG());
    const copied = (await clipboard.read()).find(item => item.types.includes("image/png"));
    if (!copied || nativeImage.createFromBuffer(Buffer.from(await (await copied.getType("image/png")).arrayBuffer())).isEmpty()) throw new Error("Copied image did not reach OS clipboard");
    console.log("Image clipboard: PNG copied from thumbnail and full-size menu without an IPC handler");
    registerImageClipboard();
    await window.webContents.executeJavaScript(`(async () => { const response = await fetch('/grungus.png'); await window.desktop.clipboard.writeImage(new Uint8Array(await response.arrayBuffer())); })()`);
    const nativeCopy = (await clipboard.read()).find(item => item.types.includes("image/png"));
    if (!nativeCopy || nativeImage.createFromBuffer(Buffer.from(await (await nativeCopy.getType("image/png")).arrayBuffer())).isEmpty()) throw new Error("Native image clipboard fallback failed");
    console.log("Viewer dismissal:", await window.webContents.executeJavaScript("window.closeImageViewer()"));
    console.log("Small image zoom:", await window.webContents.executeJavaScript("window.checkSmallImageZoom()"));
    console.log("Draft staging:", await window.webContents.executeJavaScript("window.stagePersistentDraft()"));
    await window.loadURL(process.argv[2]);
    console.log("Persistent drafts:", await window.webContents.executeJavaScript("window.checkPersistentDraft()"));
    console.log("Inline search:", await window.webContents.executeJavaScript("window.checkInlineSearch()"));
    await window.setSize(900, 800);
    console.log("Narrow header search:", await window.webContents.executeJavaScript("window.checkInlineSearch()"));
    if (process.env.SEARCH_SCREENSHOT) require("node:fs").writeFileSync(process.env.SEARCH_SCREENSHOT, (await window.webContents.capturePage()).toPNG());
    console.log("Search filter suggestions:", await window.webContents.executeJavaScript("window.checkFilterSuggestions()"));
    if (process.env.FILTER_SCREENSHOT) require("node:fs").writeFileSync(process.env.FILTER_SCREENSHOT, (await window.webContents.capturePage()).toPNG());
    console.log("Themed controls:", await window.webContents.executeJavaScript("window.checkThemedControls()"));
    if (process.env.CONTROLS_SCREENSHOT) require("node:fs").writeFileSync(process.env.CONTROLS_SCREENSHOT, (await window.webContents.capturePage()).toPNG());
    window.setSize(1280, 900);
    console.log("App themes:", await window.webContents.executeJavaScript("window.checkThemes()"));
    if (process.env.THEME_SCREENSHOT_DIR) for (const theme of await window.webContents.executeJavaScript("import('/src/domain/settings/Themes.ts').then(module => module.themes.map(theme => theme.id))")) {
      if (process.env.THEME_SCREENSHOT_IDS && !process.env.THEME_SCREENSHOT_IDS.split(",").includes(theme)) continue;
      await window.webContents.executeJavaScript(`window.showTheme(${JSON.stringify(theme)})`);
      require("node:fs").writeFileSync(path.join(process.env.THEME_SCREENSHOT_DIR, `grungus-theme-${theme}.png`), (await window.webContents.capturePage()).toPNG());
    }
    const openedLinks = [];
    window.webContents.setWindowOpenHandler(({ url }) => { openedLinks.push(url); return { action: "deny" }; });
    const linkCheck = await window.webContents.executeJavaScript("window.checkMessageLinks()");
    window.webContents.sendInputEvent({ type: "mouseMove", x: linkCheck.x, y: linkCheck.y });
    await window.webContents.executeJavaScript('new Promise(resolve => setTimeout(resolve, 200))');
    await window.webContents.executeJavaScript(`(() => { const link = document.querySelector('.message-body-text a:hover'); if (!link || getComputedStyle(link).backgroundColor === 'rgba(0, 0, 0, 0)' || getComputedStyle(link).textDecorationThickness !== '2px') throw new Error('Link hover highlight missing'); link.click(); })()`);
    if (openedLinks[0] !== "https://example.org/path?q=1") throw new Error("Link click did not request external navigation");
    console.log("Message links:", { ...linkCheck, hover: true, externalNavigation: true });
    const state = await window.webContents.executeJavaScript("window.desktop.windowControls.getState()");
    if (typeof state.maximized !== "boolean") throw new Error("Desktop window bridge unavailable");
    console.log("PASS: native file drag/drop and file selection previews, explicit send, custom titlebar and preload IPC.");
    app.exit(0);
  } catch (error) { console.error(error); app.exit(1); }
});
