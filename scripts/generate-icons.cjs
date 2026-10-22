const fs = require('node:fs/promises');
const path = require('node:path');

// Keep grungus.png as the source of truth; only generate the Windows ICO.
if (!process.versions.electron) {
  const { spawnSync } = require('node:child_process');
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const result = spawnSync(require('electron'), [__filename], { env, stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
} else {
  const { app, BrowserWindow, nativeImage } = require('electron');
  app.whenReady().then(async () => {
    const root = path.resolve(__dirname, '..');
    const source = await fs.readFile(path.join(root, 'public/grungus.png'));
    const dataUrl = 'data:image/png;base64,' + source.toString('base64');
    const window = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
    await window.loadURL('data:text/html,<html></html>');
    const png = await window.webContents.executeJavaScript(`
      new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => {
          // ICO entries are square. Fit the supplied PNG without cropping,
          // stretching, or changing the source artwork/padding.
          const scale = 512 / Math.max(image.naturalWidth, image.naturalHeight);
          const width = image.naturalWidth * scale;
          const height = image.naturalHeight * scale;
          const canvas = document.createElement('canvas');
          canvas.width = canvas.height = 512;
          const context = canvas.getContext('2d');
          context.imageSmoothingQuality = 'high';
          context.drawImage(image, (512 - width) / 2, (512 - height) / 2, width, height);
          resolve(canvas.toDataURL('image/png'));
        };
        image.onerror = () => reject(new Error('Cannot decode logo'));
        image.src = ${JSON.stringify(dataUrl)};
      })
    `);
    const icon = nativeImage.createFromDataURL(png);
    if (icon.isEmpty()) throw new Error('Empty logo');
    const sizes = [16, 24, 32, 48, 64, 128, 256];
    const images = sizes.map(size => icon.resize({ width: size, height: size, quality: 'best' }).toPNG());
    const header = Buffer.alloc(6 + sizes.length * 16);
    header.writeUInt16LE(1, 2);
    header.writeUInt16LE(sizes.length, 4);
    let offset = header.length;
    sizes.forEach((size, index) => {
      const entry = 6 + index * 16;
      header[entry] = header[entry + 1] = size === 256 ? 0 : size;
      header.writeUInt16LE(1, entry + 4);
      header.writeUInt16LE(32, entry + 6);
      header.writeUInt32LE(images[index].length, entry + 8);
      header.writeUInt32LE(offset, entry + 12);
      offset += images[index].length;
    });
    await fs.writeFile(path.join(root, 'public/grungus.ico'), Buffer.concat([header, ...images]));
    console.log('Generated multi-resolution Windows ICO from grungus.png (source PNG preserved)');
    window.destroy();
    app.quit();
  }).catch(error => { console.error(error); app.exit(1); });
}
