const fs = require('node:fs/promises');
const path = require('node:path');

// Run with Node; the Electron renderer decodes WebP without extra dependencies.
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
    const source = await fs.readFile(path.join(root, 'public/grungus-full.webp'));
    const dataUrl = 'data:image/webp;base64,' + source.toString('base64');
    const window = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
    await window.loadURL('data:text/html,<html></html>');
    const png = await window.webContents.executeJavaScript(`
      new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => {
          const source = document.createElement('canvas');
          source.width = image.naturalWidth;
          source.height = image.naturalHeight;
          const sourceContext = source.getContext('2d');
          sourceContext.drawImage(image, 0, 0);
          const { data } = sourceContext.getImageData(0, 0, source.width, source.height);
          let left = source.width, top = source.height, right = -1, bottom = -1;
          for (let y = 0; y < source.height; y++) {
            for (let x = 0; x < source.width; x++) {
              if (data[(y * source.width + x) * 4 + 3] === 0) continue;
              left = Math.min(left, x);
              right = Math.max(right, x);
              top = Math.min(top, y);
              bottom = Math.max(bottom, y);
            }
          }
          if (right < left) return reject(new Error('Empty logo'));

          // Fit the visible artwork, rather than its padded source canvas, into
          // a square. Preserve its proportions and center it for every usage.
          const width = right - left + 1;
          const height = bottom - top + 1;
          // Leave a balanced 5% inset so the frog has room inside buttons.
          const scale = (512 * 0.9) / Math.max(width, height);
          const canvas = document.createElement('canvas');
          canvas.width = canvas.height = 512;
          const context = canvas.getContext('2d');
          context.imageSmoothingQuality = 'high';
          context.drawImage(source, left, top, width, height,
            (512 - width * scale) / 2, (512 - height * scale) / 2,
            width * scale, height * scale);
          resolve(canvas.toDataURL('image/png'));
        };
        image.onerror = () => reject(new Error('Cannot decode logo'));
        image.src = ${JSON.stringify(dataUrl)};
      })
    `);
    const icon = nativeImage.createFromDataURL(png);
    if (icon.isEmpty()) throw new Error('Empty logo');
    await fs.writeFile(path.join(root, 'public/grungus.png'), icon.toPNG());
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
    console.log('Generated centered, trimmed PNG and multi-resolution Windows ICO from grungus-full.webp');
    window.destroy();
    app.quit();
  }).catch(error => { console.error(error); app.exit(1); });
}
