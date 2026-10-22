// Manual smoke test: sends a real Windows toast using the production IPC handler.
const path = require('node:path');
if (!process.versions.electron) {
  const environment = { ...process.env };
  delete environment.ELECTRON_RUN_AS_NODE;
  import('./development-runtime.mjs').then(async ({ developmentRuntime }) => {
    const result = require('node:child_process').spawnSync(await developmentRuntime(), [__filename, ...process.argv.slice(2)], {
      env: environment, stdio: 'inherit', windowsHide: true,
    });
    if (result.error) throw result.error;
    process.exit(result.status ?? 1);
  }).catch(error => { console.error(error); process.exitCode = 1; });
} else {
  const { app, BrowserWindow, ipcMain, protocol, shell } = require('electron');
  protocol.registerSchemesAsPrivileged([{ scheme: 'grungus-notification-test', privileges: { standard: true, secure: true } }]);
  app.setAppUserModelId('dev.grungus.matrix.development');
  // Keep the test browser profile separate from the running Matrix session.
  app.setPath('userData', require('node:fs').mkdtempSync(path.join(require('node:os').tmpdir(), 'grungus-notification-')));
  app.whenReady().then(async () => {
    if (process.platform === 'win32') {
      const shortcut = path.join(app.getPath('appData'), 'Microsoft/Windows/Start Menu/Programs/Grungus.lnk');
      const identity = shell.readShortcutLink(shortcut);
      if (identity.target !== process.execPath || identity.appUserModelId !== 'dev.grungus.matrix.development' || !identity.icon) throw new Error('Start the Grungus development app before testing notifications. Its Windows shortcut must match this runtime.');
      console.log('PASS: Grungus shortcut matches the branded runtime, app identity, and custom icon.');
    }
    protocol.handle('grungus-notification-test', () => new Response('<!doctype html><title>Notification test</title>', { headers: { 'content-type': 'text/html' } }));
    const { registerNotifications } = await import('../dist-electron/notifications.js');
    const window = new BrowserWindow({
      show: false, skipTaskbar: true,
      webPreferences: { preload: path.resolve('dist-electron/preload.cjs'), sandbox: true, contextIsolation: true },
    });
    registerNotifications(ipcMain, () => window, url => url === 'grungus-notification-test://client/', path.resolve('public/grungus.png'));
    await window.loadURL('grungus-notification-test://client/');
    await window.webContents.executeJavaScript(`window.desktop.notifications.show({
      title: 'Grungus', body: 'Your notifications are working. This is the requested Windows notification test.', silent: false,
    })`);
    console.log('PASS: Windows confirmed delivery of the Grungus test notification.');
    if (process.argv.includes('--examples')) {
      for (const example of [
        { title: 'Alex (test DM)', initials: 'A', color: '#8b4d73', body: 'Test DM: sender name and profile picture.' },
        { title: '#general (test channel)', initials: 'S', color: '#326d8a', body: 'Test channel: server avatar and channel name.' },
      ]) {
        await window.webContents.executeJavaScript(`(async () => {
          const example = ${JSON.stringify(example)};
          const canvas = document.createElement('canvas'); canvas.width = canvas.height = 96;
          const context = canvas.getContext('2d');
          context.beginPath(); context.arc(48, 48, 48, 0, Math.PI * 2); context.clip();
          context.fillStyle = example.color; context.fillRect(0, 0, 96, 96);
          context.fillStyle = '#fff'; context.font = 'bold 48px sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle';
          context.fillText(example.initials, 48, 50);
          await window.desktop.notifications.show({ title: example.title, body: example.body, silent: true, iconDataUrl: canvas.toDataURL('image/png') });
        })()`);
        console.log('PASS: Windows confirmed delivery:', example.title);
      }
    }
    // Give Windows time to display the toast before closing the test process.
    setTimeout(() => { window.destroy(); app.quit(); }, 8000);
  }).catch(error => { console.error(error); app.exit(1); });
}
