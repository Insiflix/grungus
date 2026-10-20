const { app, BrowserWindow, protocol, net, ipcMain } = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
protocol.registerSchemesAsPrivileged([{ scheme: "grungus-app", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);
app.setName("grungus-isolated-security-test");
app.whenReady().then(async () => {
  const { assertTrustedAppSender } = await import("../dist-electron/ipcSecurity.js");
  const { allowsAppPermission, configureAppPermissions } = await import("../dist-electron/permissions.js");
  const root = path.resolve("dist");
  protocol.handle("grungus-app", request => {
    const url = new URL(request.url);
    const destination = path.resolve(root, "." + decodeURIComponent(url.pathname));
    if (!["client", "call"].includes(url.host) || (url.host === "call" && !url.pathname.startsWith("/element-call/")) || !destination.startsWith(root + path.sep)) return new Response("Forbidden", { status: 403 });
    return net.fetch(pathToFileURL(destination).href);
  });
  const window = new BrowserWindow({ show: false, webPreferences: { preload: path.resolve("dist-electron/preload.cjs"), sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  const trusted = url => new URL(url).host === "client";
  ipcMain.handle("matrix-session:load", event => { assertTrustedAppSender(event, window, trusted); return null; });
  ipcMain.handle("window:state", () => ({ maximized: false }));
  configureAppPermissions(window.webContents.session, () => window, true);
  window.webContents.on("will-frame-navigate", event => { if (!event.isMainFrame && !allowsAppPermission("media", event.url, true, false)) event.preventDefault(); });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  try {
    await window.loadURL("grungus-app://client/index.html");
    await window.webContents.executeJavaScript(`(async () => {
      if (!isSecureContext || !window.desktop || await window.desktop.session.load() !== null) throw new Error('Trusted main-page bridge failed');
      const frame = document.createElement('iframe');
      frame.sandbox = 'allow-scripts allow-same-origin';
      frame.allow = 'microphone; camera; autoplay';
      frame.src = 'grungus-app://call/element-call/index.html#?' + new URLSearchParams({ widgetId:'security-test', parentUrl:location.href, roomId:'!test:invalid.test', userId:'@test:invalid.test', deviceId:'TEST', baseUrl:'https://matrix.invalid', intent:'start_call_voice' });
      await new Promise((resolve,reject) => { const timer=setTimeout(() => reject(new Error('Call frame load timeout')),15000); frame.onload=() => { clearTimeout(timer); resolve(); }; document.body.append(frame); });
    })()`);
    const call = window.webContents.mainFrame.frames.find(frame => frame.url.startsWith("grungus-app://call/"));
    if (!call) throw new Error("Isolated packaged call frame missing");
    const isolation = await call.executeJavaScript(`(() => {
      let parentDomBlocked=false, parentBridgeBlocked=false;
      try { void parent.document.body; } catch { parentDomBlocked=true; }
      try { void parent.desktop; } catch { parentBridgeBlocked=true; }
      return {parentDomBlocked,parentBridgeBlocked,noBridge:typeof desktop==='undefined',secure:isSecureContext,csp:!!document.querySelector('meta[http-equiv="Content-Security-Policy"]')};
    })()`);
    if (!Object.values(isolation).every(Boolean)) throw new Error("Packaged origin isolation failed: " + JSON.stringify(isolation));
    await window.webContents.executeJavaScript(`(async () => {
      const {FFmpeg} = await import('/media-codecs/controller/index.js');
      const codec = new FFmpeg();
      try { await codec.load({classWorkerURL:'grungus-app://client/media-codecs/controller/worker.js',coreURL:'grungus-app://client/media-codecs/core/ffmpeg-core.js',wasmURL:'grungus-app://client/media-codecs/core/ffmpeg-core.wasm'}); }
      finally { codec.terminate(); }
    })()`);
    console.log("PASS: production custom-protocol page has its IPC bridge; isolated call page cannot read parent DOM or bridge, and has a CSP.");
    console.log("PASS: the sandboxed media worker and local WebAssembly decoder load under the production protocol and CSP.");
    app.exit(0);
  } catch (error) { console.error(error); app.exit(1); }
}).catch(error => { console.error(error); app.exit(1); });
