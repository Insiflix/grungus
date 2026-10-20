import type { MessageAttachment } from "../../../domain/messaging/Attachments";
import { attachmentMimeType } from "../../../domain/messaging/Attachments";
let activeConversions = 0;
export const canConvertPlayback = () => typeof Worker !== "undefined" && typeof WebAssembly !== "undefined";

export async function preparePlayback(blob: Blob, attachment: MessageAttachment, kind: "video" | "audio", signal: AbortSignal): Promise<Blob> {
  const mimeType = attachmentMimeType(attachment.name, attachment.mimeType);
  const typed = blob.type === mimeType ? blob : blob.slice(0, blob.size, mimeType);
  if (document.createElement(kind).canPlayType(mimeType) || !canConvertPlayback()) return typed;
  return convertPlayback(typed, kind, signal);
}

export async function convertPlayback(blob: Blob, kind: "video" | "audio", signal: AbortSignal): Promise<Blob> {
  if (!canConvertPlayback()) throw new Error("This codec is not supported here. Download the file to play it externally.");
  if (blob.size > 256 * 1024 * 1024) throw new Error("This file is too large for local conversion (maximum 256 MB). Download it to play it externally.");
  signal.throwIfAborted();
  if (activeConversions >= 2) throw new Error("Other media is being prepared. Try again shortly.");
  ++activeConversions;
  let ffmpeg: import("@ffmpeg/ffmpeg").FFmpeg | undefined;
  const cancel = () => ffmpeg?.terminate();
  const timeout = setTimeout(cancel, 180_000);
  try {
    const { FFmpeg } = await import("@ffmpeg/ffmpeg");
    signal.throwIfAborted();
    ffmpeg = new FFmpeg();
    signal.addEventListener("abort", cancel, { once: true });
    const asset = (file: string) => new URL(`/media-codecs/${file}`, location.href).href;
    await ffmpeg.load({ classWorkerURL: asset("controller/worker.js"), coreURL: asset("core/ffmpeg-core.js"), wasmURL: asset("core/ffmpeg-core.wasm") }, { signal });
    await ffmpeg.writeFile("input.media", new Uint8Array(await blob.arrayBuffer()), { signal });
    const output = kind === "video" ? "playback.mp4" : "playback.m4a";
    const code = await ffmpeg.exec(["-hide_banner", "-loglevel", "error", "-protocol_whitelist", "file,pipe", "-i", "input.media",
      ...(kind === "video" ? ["-map", "0:v:0", "-map", "0:a:0?", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23", "-pix_fmt", "yuv420p", "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2"] : ["-vn", "-map", "0:a:0"]),
      "-c:a", "aac", "-movflags", "+faststart", "-threads", "1", "-fs", String(256 * 1024 * 1024), output], 180_000, { signal });
    if (code !== 0) throw new Error("Media conversion failed. Download the original to play it externally.");
    const result = await ffmpeg.readFile(output, "binary", { signal });
    if (!(result instanceof Uint8Array) || result.byteLength >= 256 * 1024 * 1024) throw new Error("Converted media exceeds the safe playback limit.");
    return new Blob([new Uint8Array(result)], { type: kind === "video" ? "video/mp4" : "audio/mp4" });
  } finally { clearTimeout(timeout); signal.removeEventListener("abort", cancel); ffmpeg?.terminate(); --activeConversions; }
}
