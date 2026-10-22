import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import electronPath from 'electron';

// Windows reads taskbar/toast branding from the executable's resources, even
// when BrowserWindow and the Start Menu shortcut already have custom icons.
export async function developmentRuntime() {
  if (process.platform !== 'win32') return electronPath;
  const icon = path.resolve('public/grungus.ico');
  const executable = await fs.stat(electronPath);
  const version = createHash('sha256').update(await fs.readFile(icon))
    .update(`${executable.size}:${executable.mtimeMs}:Grungus:v1`).digest('hex').slice(0, 12);
  const brandedPath = path.join(path.dirname(electronPath), `grungus-${version}.exe`);
  try { await fs.access(brandedPath); return brandedPath; } catch { /* Generate once per runtime/icon version. */ }
  const temporary = `${brandedPath}.${process.pid}.tmp.exe`;
  await fs.copyFile(electronPath, temporary);
  const require = createRequire(import.meta.url);
  const editor = path.join(path.dirname(require.resolve('electron-winstaller/package.json')), 'vendor/rcedit.exe');
  const result = spawnSync(editor, [temporary, '--set-icon', icon,
    '--set-version-string', 'ProductName', 'Grungus',
    '--set-version-string', 'FileDescription', 'Grungus',
    '--set-version-string', 'InternalName', 'Grungus',
    '--set-version-string', 'OriginalFilename', path.basename(brandedPath),
  ], { windowsHide: true, encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    await fs.unlink(temporary);
    throw result.error ?? new Error(`Cannot brand development runtime: ${result.stderr}`);
  }
  await fs.rename(temporary, brandedPath);
  return brandedPath;
}
