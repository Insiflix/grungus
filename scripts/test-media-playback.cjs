const { app, BrowserWindow } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, width: 1250, height: 850, webPreferences: { preload: path.resolve("dist-electron/preload.cjs"), sandbox: true, contextIsolation: true, backgroundThrottling: false, offscreen: true } });
  window.webContents.setAudioMuted(true);
  const evaluate = code => window.webContents.executeJavaScript(code);
  const waitFor = async code => { for (let i = 0; i < 200; i++) { const state = await evaluate(code); if (state) return state; await new Promise(resolve => setTimeout(resolve, 100)); } throw new Error(`Timed out: ${code}\n${await evaluate('document.body.innerText')}`); };
  try {
    console.log("Loading media playback fixture");
    await window.loadURL(process.argv[2]);
    await waitFor('document.querySelectorAll(".media-play-button").length === 6');
    const played = [];
    for (const name of ["clip.webm", "clip.mp4", "clip.mpg", "tone.mp3", "tone.wav", "tone.aiff"]) {
      console.log(`Checking playback: ${name}`);
      const selector = `[data-media="${name}"]`;
      await evaluate(`document.querySelector(${JSON.stringify(selector)}).querySelector('button').click()`);
      await waitFor(`(() => { const media = document.querySelector(${JSON.stringify(selector)}).querySelector('video,audio'); return media && media.readyState >= 2 && media.currentTime > 0 && !media.error; })()`);
      played.push(await evaluate(`(() => { const media = document.querySelector(${JSON.stringify(selector)}).querySelector('video,audio'); media.pause(); return { name: ${JSON.stringify(name)}, controls: media.controls, duration: media.duration, time: media.currentTime }; })()`));
    }
    window.webContents.invalidate();
    await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    await fs.writeFile(path.join(app.getPath("temp"), "grungus-media-playback.png"), (await window.webContents.capturePage()).toPNG());
    console.log(JSON.stringify({ passed: true, played, sandboxedConversion: true }));
    app.exit(0);
  } catch (error) { console.error(error); app.exit(1); }
}).catch(error => { console.error(error); app.exit(1); });
