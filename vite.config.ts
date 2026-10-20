import { cameraQualityPresets } from "./src/domain/calls/CameraQuality";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
function bundleElementCall() {
  const target = resolve("public/element-call");
  mkdirSync(target, { recursive: true });
  cpSync(resolve("node_modules/@element-hq/element-call-embedded/dist"), target, { recursive: true });
  for (const license of ["LICENSE-AGPL-3.0", "LICENSE-COMMERCIAL"]) cpSync(resolve("node_modules/@element-hq/element-call-embedded", license), resolve(target, license));
  writeFileSync(resolve(target, "config.json"), JSON.stringify({ matrix_rtc_mode: "compatibility", media_quality: { video: { max_resolution: 1080, max_bitrate: 3000000, max_framerate: 30 }, screen_share: { max_resolution: 1440, max_bitrate: 5000000, max_framerate: 30 } } }));
  writeFileSync(resolve(target, "grungus-media.js"), readFileSync(resolve("scripts/element-call-media.js"), "utf8").replace("__GRUNGUS_CAMERA_PRESETS__", JSON.stringify(cameraQualityPresets)));
  let inlineScript = 0;
  const html = readFileSync(resolve(target, "index.html"), "utf8").replace(/<script>([\s\S]*?)<\/script>/g, (_tag, source: string) => {
    const name = `grungus-bootstrap-${++inlineScript}.js`;
    writeFileSync(resolve(target, name), source);
    return `<script src="./${name}"></script>`;
  });
  const callCsp = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data: blob:; media-src 'self' https: blob:; connect-src 'self' https: wss: http://127.0.0.1:* http://localhost:* ws://127.0.0.1:* ws://localhost:*; worker-src 'self' blob:; font-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'none'";
  writeFileSync(resolve(target, "index.html"), html.replace("<head>", `<head><meta http-equiv="Content-Security-Policy" content="${callCsp}"><script src="./grungus-media.js"></script>`).replace("</head>", '<link rel="stylesheet" href="./grungus.css"></head>'));
  writeFileSync(resolve(target, "grungus.css"), ':root{color-scheme:dark;--cpd-color-bg-canvas-default:#0b2024;--cpd-color-bg-subtle-primary:#163337;--cpd-color-text-action-accent:#a4e1c9}body{background:linear-gradient(145deg,#102e32,#091b23)!important}');
  return { name: "bundle-element-call" };
}
function bundleMediaCodecs() {
  const target = resolve("public/media-codecs");
  mkdirSync(target, { recursive: true });
  cpSync(resolve("node_modules/@ffmpeg/core/dist/esm"), resolve(target, "core"), { recursive: true });
  cpSync(resolve("node_modules/@ffmpeg/ffmpeg/dist/esm"), resolve(target, "controller"), { recursive: true });
  return { name: "bundle-sandboxed-media-codecs" };
}
export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(JSON.parse(readFileSync(resolve("package.json"), "utf8")).version) },
  base: "./",
  plugins: [bundleElementCall(), bundleMediaCodecs(), react(), tailwindcss()],
  server: { host: "127.0.0.1", port: 5173, strictPort: true },
  build: { outDir: "dist" }, worker: { format: "es" },
});
