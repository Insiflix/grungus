import { cameraQualityPresets } from "./src/domain/calls/CameraQuality";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { cpSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
function bundleMicrophoneAudio() {
  const target = resolve("public/audio");
  mkdirSync(target, { recursive: true });
  for (const file of ["microphone-processing.js", "microphone-gate.js"]) cpSync(resolve("scripts", file), resolve(target, file));
  mkdirSync(resolve(target, "vendor/rnnoise"), { recursive: true });
  for (const asset of ["index.js", "rnnoise.wasm", "rnnoise_simd.wasm", "rnnoise/workletProcessor.js"]) cpSync(resolve("node_modules/@sapphi-red/web-noise-suppressor/dist", asset), resolve(target, "vendor", asset));
  cpSync(resolve("node_modules/@sapphi-red/web-noise-suppressor/LICENSE"), resolve(target, "LICENSE-web-noise-suppressor"));
  return { name: "bundle-local-microphone-audio" };
}
function bundleElementCall() {
  const target = resolve("public/element-call");
  mkdirSync(target, { recursive: true });
  cpSync(resolve("node_modules/@element-hq/element-call-embedded/dist"), target, { recursive: true });
  // Pin the bridge to the installed Element mapping and fail loudly on API changes.
  const participantHook = "subscribe(e=>{let n=t.value.connection?.transport.livekit_service_url;";
  let hooked = false;
  for (const name of readdirSync(resolve(target, "assets"))) {
    if (!name.endsWith(".js")) continue;
    const file = resolve(target, "assets", name);
    let source = readFileSync(file, "utf8");
    if (!source.includes(participantHook)) continue;
    const audioMix = "webAudioMix:!1,singlePeerConnection:!0";
    if (!source.includes(audioMix)) throw new Error("Element Call Web Audio bridge needs updating.");
    source = source.replace(participantHook, "subscribe(e=>{window.grungusRegisterParticipant?.(t.value.membership.userId,t.value.membership.rtcBackendIdentity,e);let n=t.value.connection?.transport.livekit_service_url;")
      .replace(audioMix, "webAudioMix:!0,singlePeerConnection:!0");
    writeFileSync(file, source); hooked = true;
  }
  if (!hooked) throw new Error("Element Call participant audio bridge needs updating.");
  cpSync(resolve("public/audio"), resolve(target, "audio"), { recursive: true });
  for (const license of ["LICENSE-AGPL-3.0", "LICENSE-COMMERCIAL"]) cpSync(resolve("node_modules/@element-hq/element-call-embedded", license), resolve(target, license));
  writeFileSync(resolve(target, "config.json"), JSON.stringify({ matrix_rtc_mode: "compatibility", media_quality: { video: { max_resolution: 1080, max_bitrate: 3000000, max_framerate: 30 }, screen_share: { max_resolution: 1440, max_bitrate: 5000000, max_framerate: 30 } } }));
  writeFileSync(resolve(target, "grungus-media.js"), readFileSync(resolve("scripts/element-call-media.js"), "utf8").replace("__GRUNGUS_CAMERA_PRESETS__", JSON.stringify(cameraQualityPresets)));
  cpSync(resolve("scripts/element-call-fullscreen.js"), resolve(target, "grungus-fullscreen.js"));
  cpSync(resolve("scripts/element-call-tooltips.js"), resolve(target, "grungus-tooltips.js"));
  let inlineScript = 0;
  const html = readFileSync(resolve(target, "index.html"), "utf8").replace(/<script>([\s\S]*?)<\/script>/g, (_tag, source: string) => {
    const name = `grungus-bootstrap-${++inlineScript}.js`;
    writeFileSync(resolve(target, name), source);
    return `<script src="./${name}"></script>`;
  });
  const callCsp = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data: blob:; media-src 'self' https: blob:; connect-src 'self' https: wss: http://127.0.0.1:* http://localhost:* ws://127.0.0.1:* ws://localhost:*; worker-src 'self' blob:; font-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'none'";
  writeFileSync(resolve(target, "index.html"), html.replace("<head>", `<head><meta http-equiv="Content-Security-Policy" content="${callCsp}"><script src="./audio/microphone-processing.js"></script><script src="./grungus-media.js"></script><script src="./grungus-fullscreen.js"></script><script src="./grungus-tooltips.js"></script>`).replace("</head>", '<link rel="stylesheet" href="./grungus.css"></head>'));
  cpSync(resolve("scripts/element-call-theme.css"), resolve(target, "grungus.css"));
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
  plugins: [bundleMicrophoneAudio(), bundleElementCall(), bundleMediaCodecs(), react(), tailwindcss()],
  server: { host: "127.0.0.1", port: 5173, strictPort: true },
  build: { outDir: "dist" }, worker: { format: "es" },
});
