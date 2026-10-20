import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, readdir, unlink, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { createServer } from "vite";
import electron from "electron";
const ffmpeg = createRequire(import.meta.url)("ffmpeg-static");
const directory = await mkdtemp(path.join(tmpdir(), "grungus-playback-check-"));
const samples = ["clip.webm", "clip.mp4", "clip.mpg", "tone.mp3", "tone.wav", "tone.aiff"];
let server;
try {
  for (const name of samples) {
    const video = name.startsWith("clip");
    const codecs = name.endsWith("webm") ? ["-c:v", "libvpx-vp9", "-c:a", "libopus"] : name.endsWith("mp4") ? ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac"] : name.endsWith("mpg") ? ["-c:v", "mpeg2video", "-c:a", "mp2"] : [];
    await promisify(execFile)(ffmpeg, ["-hide_banner", "-loglevel", "error", ...(video ? ["-f", "lavfi", "-i", "color=c=teal:s=320x240:r=25"] : []), "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100", "-t", "2", ...codecs, path.join(directory, name)], { windowsHide: true });
  }
  server = await createServer({ plugins: [{ name: "media-samples", configureServer(server) { server.middlewares.use("/test-media", async (request, response) => {
    const name = request.url?.slice(1);
    if (!samples.includes(name)) { response.statusCode = 404; response.end(); return; }
    try { response.end(await readFile(path.join(directory, name))); } catch { response.statusCode = 500; response.end(); }
  }); } }], server: { port: 0, strictPort: false } });
  await server.listen();
  const env = { ...process.env, GRUNGUS_MEDIA_TEST_DIR: directory }; delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(electron, ["scripts/test-media-playback.cjs", `http://127.0.0.1:${server.httpServer.address().port}/scripts/fixtures/media-playback.html`], { env, stdio: "inherit", windowsHide: true });
  const timeout = setTimeout(() => child.kill(), 60_000);
  try { process.exitCode = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", code => resolve(code ?? 1)); }); }
  finally { clearTimeout(timeout); }
  const remaining = await readdir(directory);
  if (remaining.some(name => !samples.includes(name))) throw new Error("Converted media temporary files were not cleaned up");
} finally {
  if (server) await server.close();
  await Promise.all(samples.map(name => unlink(path.join(directory, name)).catch(() => {})));
  await rmdir(directory);
}
