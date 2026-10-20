const { app, BrowserWindow, session } = require("electron");
app.setName("grungus-isolated-call-test");
app.commandLine.appendSwitch("use-fake-device-for-media-stream");
app.whenReady().then(async () => {
  const errors = [];
  const window = new BrowserWindow({ width:1440, height:900, show: false, webPreferences: { offscreen: true, backgroundThrottling: false, sandbox: true, contextIsolation: true, nodeIntegration: false } });
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => callback({ cancel: /^https?:/.test(details.url) && !/^http:\/\/(127\.0\.0\.1|localhost):5175\//.test(details.url) }));
  session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) => callback(permission === "media" || permission === "fullscreen"));
  window.webContents.on("console-message", event => {
    if (/Failed to load config|Failed to obtain the host|Improper sequence|Unknown or unsupported from-widget action|violates the following Content Security Policy|Refused to .*Content Security Policy/.test(event.message)) errors.push(event.message);
  });
  try {
    await window.loadURL("http://127.0.0.1:5175/scripts/fixtures/element-call-smoke.html");
    const callFrame = () => window.webContents.mainFrame.frames.find(frame => frame.url.includes("/element-call/index.html"));
    let result;
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      const frame = callFrame();
      result = frame ? await frame.executeJavaScript(`({ text: document.body?.innerText ?? '', url: location.href, secure: isSecureContext })`) : null;
      if (result?.text.includes("Anruf beitreten")) break;
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    if (!result?.text.includes("Anruf beitreten") || errors.length || !result.secure || !result.url.includes("intent=start_call_voice")) throw new Error(JSON.stringify({ result, errors }));
    const isolated = await callFrame().executeJavaScript(`(() => { let blocked = false; try { void parent.document.body; } catch { blocked = true; } return { blocked, noBridge: typeof window.desktop === 'undefined' }; })()`);
    if (!isolated.blocked || !isolated.noBridge) throw new Error('Call frame can reach the application: ' + JSON.stringify(isolated));
    console.log('PASS: isolated call origin cannot read parent DOM or access the desktop bridge.');
    console.log("PASS: official Element Call loads config, completes widget handshake, receives room state, and renders the voice lobby.");
    await new Promise(resolve => setTimeout(resolve, 600));
    if (process.env.GRUNGUS_CALL_SCREENSHOT) { require("node:fs").writeFileSync(process.env.GRUNGUS_CALL_SCREENSHOT, (await window.webContents.capturePage()).toPNG()); }
    const preview = await window.webContents.executeJavaScript(`({ preview:!!document.querySelector('.call-panel--preview'), loading:!!document.querySelector('.call-panel__loading'), minimize:!!document.querySelector('button[aria-label="Minimize call"]') })`);
    if (!preview.preview || preview.loading || preview.minimize) throw new Error('Pre-join state incorrect: ' + JSON.stringify(preview));
    for (const [width, height] of [[980,640],[480,640]]) {
      window.setContentSize(width,height);
      await new Promise(resolve => setTimeout(resolve,200));
      const bounds = await window.webContents.executeJavaScript(`(()=>{ const frame=document.querySelector('iframe'), panel=document.querySelector('.call-panel'); const p=panel.getBoundingClientRect(),f=frame.getBoundingClientRect(); return { panel:{left:p.left,right:p.right,top:p.top,bottom:p.bottom}, viewport:{width:innerWidth,height:innerHeight}, frameHeight:f.height, frameWidth:f.width }; })()`);
      bounds.join = await callFrame().executeJavaScript(`(()=>{ const j=[...document.querySelectorAll('button')].find(button=>button.textContent==='Anruf beitreten').getBoundingClientRect(); return {left:j.left,right:j.right,top:j.top,bottom:j.bottom}; })()`);
      if(bounds.panel.left < -1 || bounds.panel.right > bounds.viewport.width+1 || bounds.panel.top < -1 || bounds.panel.bottom > bounds.viewport.height+1 || bounds.join.bottom > bounds.frameHeight || bounds.join.right > bounds.frameWidth) throw new Error('Preview clipped: '+JSON.stringify(bounds));
    }
    window.setContentSize(1440,900);
    console.log('PASS: centered pre-join window keeps join controls visible at desktop and narrow sizes; minimize stays hidden.');
    await callFrame().executeJavaScript(`(async () => { window.__smokeCameraStream = await navigator.mediaDevices.getUserMedia({video:true,audio:false}); })()`);
    const response = await window.webContents.executeJavaScript(`(async () => {
      const frame = document.querySelector('iframe');
      const widgetId = new URLSearchParams(new URL(frame.src).hash.slice(2)).get('widgetId');
      const origin = new URL(frame.src).origin;
      const changed = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('quality acknowledgement timeout')), 5000);
        const receive = event => { if(event.source === frame.contentWindow && event.origin === origin && event.data?.type === 'grungus:media-status' && event.data.quality) { clearTimeout(timer); window.removeEventListener('message', receive); resolve(event.data); } };
        window.addEventListener('message', receive);
      });
      frame.contentWindow.postMessage({ type:'grungus:camera-quality', widgetId, quality:'360p' }, origin);
      return changed;
    })()`);
    const settings = await callFrame().executeJavaScript(`(() => { const stream = window.__smokeCameraStream; const settings = stream.getVideoTracks()[0].getSettings(); stream.getTracks().forEach(track => track.stop()); return settings; })()`);
    const cameraResult = {response, settings};
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
    const joined = await window.webContents.executeJavaScript(`(()=>{ const minimize=document.querySelector('button[aria-label="Minimize call"]'); const result={preview:!!document.querySelector('.call-panel--preview'),minimize:!!minimize}; minimize?.click(); return result;})()`);
    if(joined.preview || !joined.minimize) throw new Error('Call layout did not activate after joining');
    console.log('PASS: full call layout and minimize become available only after the join notification.');
    await new Promise(resolve => setTimeout(resolve,100));
    const docked = await window.webContents.executeJavaScript(`(() => {
      const dock = document.querySelector('.voice-dock'), panel = document.querySelector('.call-panel');
      return { dock: !!dock?.closest('.room-sidebar'), away: panel.classList.contains('call-panel--away'), deafen: !!dock?.querySelector('button[aria-label="Deafen"]') };
    })()`);
    if (!docked.dock || !docked.away || !docked.deafen) throw new Error('Voice controls did not dock: ' + JSON.stringify(docked));
    const originalFrame = callFrame().routingId;
    await window.webContents.executeJavaScript(`document.querySelector('.voice-dock__room').click()`);
    await new Promise(resolve => setTimeout(resolve,100));
    const bounds = await window.webContents.executeJavaScript(`(() => {
      const panel = document.querySelector('.call-panel'), sidebar = document.querySelector('.room-sidebar');
      const p = panel.getBoundingClientRect(), s = sidebar.getBoundingClientRect();
      return { left:p.left, sidebarRight:s.right, right:p.right, bottom:p.bottom, visible: !panel.classList.contains('call-panel--away'), width:innerWidth, height:innerHeight };
    })()`);
    if (!bounds.visible || bounds.left < bounds.sidebarRight || bounds.right > bounds.width || bounds.bottom > bounds.height) throw new Error('Inline call overlaps navigation: ' + JSON.stringify(bounds));
    await window.webContents.executeJavaScript('window.__smokeEnableChat()');
    await new Promise(resolve => setTimeout(resolve,100));
    const chatBefore = await window.webContents.executeJavaScript(`document.querySelector('.call-panel__media').getBoundingClientRect().width`);
    await window.webContents.executeJavaScript(`document.querySelector('.call-panel .voice-chat-toggle').click(); window.__smokeVoiceUnread(7);`);
    await new Promise(resolve => setTimeout(resolve,100));
    const hiddenChat = await window.webContents.executeJavaScript(`(() => ({ hidden:getComputedStyle(document.querySelector('.voice-chat-slot')).display === 'none', width:document.querySelector('.call-panel__media').getBoundingClientRect().width, badge:document.querySelector('.call-panel .voice-chat-toggle').textContent }))()`);
    if (!hiddenChat.hidden || hiddenChat.width <= chatBefore || !hiddenChat.badge.includes('7')) throw new Error('Chat did not collapse with unread badge: '+JSON.stringify({chatBefore,hiddenChat}));
    await window.webContents.executeJavaScript(`document.querySelector('.call-panel .voice-chat-toggle').click()`);
    await new Promise(resolve => setTimeout(resolve,100));
    const restoredChat = await window.webContents.executeJavaScript(`({draft:document.querySelector('textarea[aria-label="Voice draft"]').value, expanded:document.querySelector('.call-panel .voice-chat-toggle').getAttribute('aria-expanded')})`);
    if (restoredChat.draft !== 'Unsent draft' || restoredChat.expanded !== 'true' || callFrame().routingId !== originalFrame) throw new Error('Chat reopening lost state');
    console.log('PASS: hiding voice chat grows the media area, displays unread counts and preserves drafts and the call session.');
    const headerControls = await window.webContents.executeJavaScript(`(() => {
      const header = document.querySelector('.call-panel > header');
      return [...header.querySelectorAll(':scope > button, :scope > label .themed-select__trigger')].map(element => { const r=element.getBoundingClientRect(); return {height:r.height,center:r.top+r.height/2}; });
    })()`);
    if (headerControls.some(control => Math.abs(control.height-34)>1 || Math.abs(control.center-headerControls[0].center)>1)) throw new Error('Voice header controls misaligned: '+JSON.stringify(headerControls));
    console.log('PASS: camera selector, chat, minimize and leave controls share a 34px height and center line.');
    if (process.env.GRUNGUS_VOICE_HEADER_SCREENSHOT) require('node:fs').writeFileSync(process.env.GRUNGUS_VOICE_HEADER_SCREENSHOT, (await window.webContents.capturePage()).toPNG());
    await window.webContents.executeJavaScript(`window.__smokeBrowseAway()`);
    await new Promise(resolve => setTimeout(resolve,100));
    if (callFrame().routingId !== originalFrame) throw new Error('Browsing replaced the call iframe');
    if (process.env.GRUNGUS_VOICE_SCREENSHOT) require('node:fs').writeFileSync(process.env.GRUNGUS_VOICE_SCREENSHOT, (await window.webContents.capturePage()).toPNG());
    console.log('PASS: voice controls dock in the sidebar; the call opens inline and survives browsing away.');
    // Exercise the isolated host-to-widget sharing path without granting desktop capture.
    let captureRequests = 0;
    window.webContents.debugger.attach('1.3');
    await window.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true });
    const { targetInfos } = await window.webContents.debugger.sendCommand('Target.getTargets');
    const callTarget = targetInfos.find(target => target.type === 'iframe' && target.url.includes('/element-call/'));
    if (callTarget) {
      const { sessionId } = await window.webContents.debugger.sendCommand('Target.attachToTarget', { targetId: callTarget.targetId, flatten:true });
      await window.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', {enabled:true}, sessionId);
    }
    // Synthetic camera/share videos exercise the actual fullscreen API without real media or peers.
    await window.webContents.executeJavaScript(`document.querySelector('.voice-dock__room').click()`);
    await new Promise(resolve => setTimeout(resolve,100));
    await callFrame().executeJavaScript(`(() => {
      for (const id of ['camera','screen']) {
        const tile = document.createElement('div'); tile.dataset.testid = 'videoTile'; tile.dataset.videoEnabled = 'true'; tile.id = 'smoke-'+id;
        const video = document.createElement('video'); tile.append(video); document.body.append(tile);
        const canvas = document.createElement('canvas'); canvas.width=320; canvas.height=180;
        canvas.getContext('2d').fillRect(0,0,320,180); video.srcObject=canvas.captureStream(1); video.muted=true;
      }
    })()`);
    await new Promise(resolve => setTimeout(resolve,100));
    await callFrame().executeJavaScript(`document.querySelector('#smoke-camera .grungus-tile-fullscreen').click()`, true);
    await new Promise(resolve => setTimeout(resolve,250));
    const cameraFullscreen = await callFrame().executeJavaScript(`document.fullscreenElement === document.querySelector('#smoke-camera video')`);
    if (!cameraFullscreen) throw new Error('Camera did not enter fullscreen');
    await callFrame().executeJavaScript('document.exitFullscreen()');
    await new Promise(resolve => setTimeout(resolve,250));
    await callFrame().executeJavaScript(`document.querySelector('#smoke-screen video').dispatchEvent(new MouseEvent('dblclick', {bubbles:true}))`, true);
    await new Promise(resolve => setTimeout(resolve,250));
    const screenFullscreen = await callFrame().executeJavaScript(`document.fullscreenElement === document.querySelector('#smoke-screen video')`);
    if (!screenFullscreen) throw new Error('Screen share did not enter fullscreen');
    await callFrame().executeJavaScript(`(async () => { await document.exitFullscreen(); for (const tile of document.querySelectorAll('[id^="smoke-"][data-testid="videoTile"]')) { tile.querySelector('video').srcObject.getTracks().forEach(track=>track.stop()); tile.remove(); } })()`);
    console.log('PASS: camera button and screen-share double-click enter native fullscreen and exit without replacing the call.');
    // Record consent routing but never supply a source; the fixture exits with capture still ungranted.
    session.defaultSession.setDisplayMediaRequestHandler(() => { captureRequests++; });
    await callFrame().executeJavaScript(`(() => {
      const footer = document.createElement('div'); footer.dataset.testid = 'footer-container'; footer.id = 'smoke-toolbar';
      footer.innerHTML = '<div class="_buttons_fixture"><div><button data-testid="incall_mute">Mic</button><button>Devices</button></div><button data-testid="incall_videomute">Camera</button><button data-testid="incall_screenshare">Share</button><button data-testid="incall_leave">Leave</button><button id="smoke-reactions">Reactions</button></div><fieldset><input type="radio" checked /></fieldset>';
      document.body.append(footer);
      window.__smokeCaptureError = null;
      footer.querySelector('[data-testid="incall_screenshare"]').onclick = () => {
        window.__smokeShareClicked = true;
        navigator.mediaDevices.getDisplayMedia({video:true}).then(stream => stream.getTracks().forEach(track => track.stop())).catch(error => { window.__smokeCaptureError = error.name; });
      };
    })()`);
    await window.webContents.executeJavaScript(`document.querySelector('.voice-dock button[aria-label="Share screen"]').click()`);
    await new Promise(resolve => setTimeout(resolve,500));
    const toolbar = await callFrame().executeJavaScript(`(() => {
      const footer = document.querySelector('#smoke-toolbar');
      return { clicked:window.__smokeShareClicked, target:document.querySelector('button[data-testid="incall_screenshare"]')?.outerHTML, hosted:document.documentElement.hasAttribute('data-grungus-host-controls'), shareHidden:getComputedStyle(footer.querySelector('[data-testid="incall_screenshare"]')).display === 'none', splitHidden:getComputedStyle(footer.querySelector('._buttons_fixture > div')).display === 'none', radius:getComputedStyle(document.querySelector('#smoke-reactions')).borderRadius, captureError:window.__smokeCaptureError };
    })()`);
    if (!captureRequests || !toolbar.hosted || !toolbar.shareHidden || !toolbar.splitHidden || toolbar.radius !== '8px') throw new Error('Sidebar sharing or toolbar styling failed: ' + JSON.stringify({captureRequests,toolbar, focus:await callFrame().executeJavaScript('({focus:document.hasFocus(),visibility:document.visibilityState,activation:navigator.userActivation.isActive})')}));
    console.log('PASS: sidebar sharing reaches Electron capture consent across origins; duplicate controls are hidden and remaining controls match the theme. No capture granted.');
    await window.loadURL('http://127.0.0.1:5175/scripts/fixtures/element-call-smoke.html?autojoin=1');
    let autoJoin;
    const autoJoinDeadline = Date.now() + 10000;
    while (Date.now() < autoJoinDeadline) {
      autoJoin = await window.webContents.executeJavaScript(`({attempted:!!window.__smokeAutoJoinAttempted, preview:!!document.querySelector('.call-panel--preview'), inline:!!document.querySelector('.call-panel--docked')})`);
      if (autoJoin.attempted) break;
      await new Promise(resolve => setTimeout(resolve,100));
    }
    const autoJoinFrame = callFrame();
    const lobby = autoJoinFrame ? await autoJoinFrame.executeJavaScript(`({joinButton:!!document.querySelector('[data-testid="joincall_joincall"]'), skipLobby:new URLSearchParams(location.hash.slice(2)).get('skipLobby')})`) : null;
    if (!autoJoin?.attempted || autoJoin.preview || !autoJoin.inline || lobby?.joinButton || lobby?.skipLobby !== 'true') throw new Error('Voice channel required a second join: '+JSON.stringify({autoJoin,lobby}));
    console.log('PASS: voice channels automatically reach RTC authorization without a second Join button or modal. Test authorization remains denied.');
    app.exit(0);
  } catch (error) { console.error(error); app.exit(1); }
});
