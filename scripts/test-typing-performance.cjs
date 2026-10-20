const { app, BrowserWindow } = require("electron");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const percentile = (values, p) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * p))] ?? 0;
app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, width: 1200, height: 800, webPreferences: { offscreen: true, backgroundThrottling: false } });
  try {
    await window.loadURL(process.argv[2]);
    const reports = [];
    for (const { sync, crypto } of [{ sync: false, crypto: false }, { sync: true, crypto: false }, { sync: false, crypto: true }]) {
      await window.reload();
      await new Promise(resolve => window.webContents.once("did-finish-load", resolve));
      await delay(300);
      const setup = await window.webContents.executeJavaScript(`window.startTypingBenchmark(${sync}, ${crypto})`);
      const text = "Actual keyboard input should stay responsive even while this loaded chat receives updates. ";
      const sent = text.repeat(2);
      const latencies = [];
      const pendingKeys = [];
      // Send OS-style key/character events at 50 keys/sec without waiting for React between keys.
      let count = 0;
      for (const character of sent) {
        const queued = performance.now();
        window.webContents.sendInputEvent({ type: "keyDown", keyCode: character === " " ? "Space" : character.toUpperCase() });
        window.webContents.sendInputEvent({ type: "char", keyCode: character });
        window.webContents.sendInputEvent({ type: "keyUp", keyCode: character === " " ? "Space" : character.toUpperCase() });
        count++;
        const expected = count;
        const pending = window.webContents.executeJavaScript(`new Promise(resolve => requestAnimationFrame(() => resolve(document.querySelector('textarea').value.length)))`).then(length => { if (length < expected) throw new Error(`Keystroke ${expected} has not appeared`); latencies.push(performance.now() - queued); });
        pendingKeys.push(pending);
        pending.catch(() => {});
        await delay(20);
      }
      await Promise.all(pendingKeys);
      await delay(600);
      const result = await window.webContents.executeJavaScript("window.stopTypingBenchmark()");
      if (result.value !== sent) throw new Error(`Lost or reordered input: ${result.value.length}/${sent.length}`);
      const report = { sync, crypto, ...setup, keys: sent.length, keyToFrameP95: Math.round(percentile(latencies, .95)), worstKey: Math.round(Math.max(...latencies)), renderP95: Math.round(percentile(result.commits, .95)), slowEvents: result.events.length, maxEventDuration: Math.max(0, ...result.events.map(e => e.duration)), typingRequests: result.typingRequests };
      console.log(report); reports.push(report);
      if (crypto && result.typingRequests > 1) throw new Error("Continuous typing flooded sync/crypto with notifications");
    }
    if (reports.some(report => report.keyToFrameP95 > 100 || report.worstKey > 250)) throw new Error("Keyboard latency exceeds the 100ms p95 / 250ms worst-case budget");
    app.exit(0);
  } catch (error) { console.error(error); app.exit(1); }
});
