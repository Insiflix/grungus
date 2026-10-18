const { app, BrowserWindow, session } = require("electron");
app.setName("grungus-isolated-call-test");
app.commandLine.appendSwitch("use-fake-device-for-media-stream");
app.commandLine.appendSwitch("use-fake-ui-for-media-stream");
app.whenReady().then(async () => {
  const errors = [];
  const window = new BrowserWindow({ width:1440, height:900, show: false, webPreferences: { offscreen: true, backgroundThrottling: false, sandbox: true, contextIsolation: true, nodeIntegration: false } });
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => callback({ cancel: /^https?:/.test(details.url) && !details.url.startsWith("http://127.0.0.1:5175/") }));
  session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) => callback(permission === "media"));
  window.webContents.on("console-message", event => {
    if (/Failed to load config|Failed to obtain the host|Improper sequence|Unknown or unsupported from-widget action/.test(event.message)) errors.push(event.message);
  });
  try {
    await window.loadURL("http://127.0.0.1:5175/scripts/fixtures/element-call-smoke.html");
    let result;
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      result = await window.webContents.executeJavaScript(`({ text: document.querySelector('iframe')?.contentDocument?.body?.innerText ?? '', url: document.querySelector('iframe')?.src, secure: isSecureContext })`);
      if (result.text.includes("Anruf beitreten")) break;
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    if (!result?.text.includes("Anruf beitreten") || errors.length || !result.secure || !result.url.includes("intent=start_call_voice")) throw new Error(JSON.stringify({ result, errors }));
    console.log("PASS: official Element Call loads config, completes widget handshake, receives room state, and renders the voice lobby.");
    await new Promise(resolve => setTimeout(resolve, 600));
    if (process.env.GRUNGUS_CALL_SCREENSHOT) { require("node:fs").writeFileSync(process.env.GRUNGUS_CALL_SCREENSHOT, (await window.webContents.capturePage()).toPNG()); }
    const preview = await window.webContents.executeJavaScript(`({ preview:!!document.querySelector('.call-panel--preview'), loading:!!document.querySelector('.call-panel__loading'), minimize:!!document.querySelector('button[aria-label="Anruf minimieren"]') })`);
    if (!preview.preview || preview.loading || preview.minimize) throw new Error('Pre-join state incorrect: ' + JSON.stringify(preview));
    for (const [width, height] of [[980,640],[480,640]]) {
      window.setContentSize(width,height);
      await new Promise(resolve => setTimeout(resolve,200));
      const bounds = await window.webContents.executeJavaScript(`(()=>{ const frame=document.querySelector('iframe'), panel=document.querySelector('.call-panel'), join=[...frame.contentDocument.querySelectorAll('button')].find(button=>button.textContent==='Anruf beitreten'); const p=panel.getBoundingClientRect(),f=frame.getBoundingClientRect(),j=join.getBoundingClientRect(); return { panel:{left:p.left,right:p.right,top:p.top,bottom:p.bottom}, viewport:{width:innerWidth,height:innerHeight}, frameHeight:f.height, join:{left:j.left,right:j.right,top:j.top,bottom:j.bottom}, frameWidth:f.width }; })()`);
      if(bounds.panel.left < -1 || bounds.panel.right > bounds.viewport.width+1 || bounds.panel.top < -1 || bounds.panel.bottom > bounds.viewport.height+1 || bounds.join.bottom > bounds.frameHeight || bounds.join.right > bounds.frameWidth) throw new Error('Preview clipped: '+JSON.stringify(bounds));
    }
    window.setContentSize(1440,900);
    console.log('PASS: centered pre-join window keeps join controls visible at desktop and narrow sizes; minimize stays hidden.');
    const cameraResult = await window.webContents.executeJavaScript(`(async () => {
      const frame = document.querySelector('iframe');
      const media = frame.contentWindow.navigator.mediaDevices;
      const stream = await media.getUserMedia({ video: true, audio: false });
      const track = stream.getVideoTracks()[0];
      const widgetId = new URLSearchParams(new URL(frame.src).hash.slice(2)).get('widgetId');
      const changed = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('quality acknowledgement timeout')), 5000);
        const receive = event => { if(event.source === frame.contentWindow && event.data?.type === 'grungus:media-status' && event.data.quality) { clearTimeout(timer); window.removeEventListener('message', receive); resolve(event.data); } };
        window.addEventListener('message', receive);
      });
      frame.contentWindow.postMessage({ type:'grungus:camera-quality', widgetId, quality:'360p' }, location.origin);
      const response = await changed;
      const settings = track.getSettings();
      stream.getTracks().forEach(track => track.stop());
      return { response, settings };
    })()`);
    if (cameraResult.response.qualityError || cameraResult.response.quality !== '360p' || cameraResult.settings.height > 360) throw new Error('Camera quality update failed: ' + JSON.stringify(cameraResult));
    console.log('PASS: live synthetic camera changes to 360p without restarting the widget.');
    const pickerResult = await window.webContents.executeJavaScript(`(async () => {
      window.__smokeShareRequest({ id:'capture-test', audioRequested:true, systemAudioSupported:true, sources:[{ id:'screen:test', name:'Testbildschirm', kind:'screen', thumbnail:'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"></svg>' }] });
      await new Promise(resolve => setTimeout(resolve, 100));
      const dialog = document.querySelector('dialog.screen-picker');
      const confirm = [...dialog.querySelectorAll('button')].find(button => button.textContent === 'Jetzt teilen');
      const unselectedDisabled = confirm.disabled;
      dialog.querySelector('.screen-picker__sources button').click();
      await new Promise(resolve => setTimeout(resolve, 50));
      confirm.click();
      await new Promise(resolve => setTimeout(resolve, 50));
      return { unselectedDisabled, response: window.__smokeShareResponse };
    })()`);
    if (!pickerResult.unselectedDisabled || pickerResult.response?.sourceId !== 'screen:test' || !pickerResult.response.audio) throw new Error('Capture picker consent failed: ' + JSON.stringify(pickerResult));
    console.log('PASS: screen picker requires source selection and forwards explicit system-audio consent (no desktop captured).');
    await window.webContents.executeJavaScript(`window.__smokeNotifyJoined()`);
    await new Promise(resolve => setTimeout(resolve,100));
    const joined = await window.webContents.executeJavaScript(`(()=>{ const minimize=document.querySelector('button[aria-label="Anruf minimieren"]'); const result={preview:!!document.querySelector('.call-panel--preview'),minimize:!!minimize}; minimize?.click(); return result;})()`);
    if(joined.preview || !joined.minimize) throw new Error('Call layout did not activate after joining');
    console.log('PASS: full call layout and minimize become available only after the join notification.');
    app.exit(0);
  } catch (error) { console.error(error); app.exit(1); }
});
