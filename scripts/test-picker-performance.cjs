const { app, BrowserWindow } = require("electron");

app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, width: 1200, height: 800, webPreferences: { offscreen: true, backgroundThrottling: false } });
  try {
    await window.loadURL(process.argv[2]);
    for (const [width, height] of [[1200, 800], [440, 640]]) {
      window.setContentSize(width, height);
      const { openMilliseconds, timings } = await window.webContents.executeJavaScript("window.measurePicker()");
      console.log(`${width}px viewport: first screen ready in ${Math.round(openMilliseconds)}ms`);
      console.table(timings.map(row => ({ ...row, milliseconds: Math.round(row.milliseconds) })));
      if (openMilliseconds > 750) throw new Error(`Emoji picker opening exceeded 750ms: ${openMilliseconds}`);
      const slow = timings.filter(row => row.milliseconds > 150);
      if (slow.length) throw new Error(`Emoji tab click-to-paint exceeded 150ms: ${JSON.stringify(slow)}`);
    }
    if (process.env.PICKER_SCREENSHOT) require("node:fs").writeFileSync(process.env.PICKER_SCREENSHOT, (await window.webContents.capturePage()).toPNG());
    app.exit(0);
  } catch (error) { console.error(error); app.exit(1); }
});
