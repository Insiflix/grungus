export interface MediaMetadata {
  durationMs?: number;
  width?: number;
  height?: number;
  poster?: Blob;
}

/** Decode metadata/a representative frame from local bytes, without playing sound. */
export function readMediaMetadata(blob: Blob, kind: "video" | "audio", signal?: AbortSignal, poster = kind === "video"): Promise<MediaMetadata> {
  if (typeof document === "undefined") return Promise.resolve({});
  signal?.throwIfAborted();
  const media = document.createElement(kind);
  if (!media.canPlayType(blob.type)) return Promise.resolve({});
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    let done = false, seeking = false, capturing = false;
    let metadata: MediaMetadata = {};
    const clean = () => {
      clearTimeout(timeout); signal?.removeEventListener("abort", abort);
      media.removeEventListener("loadedmetadata", loaded); media.removeEventListener("loadeddata", frame); media.removeEventListener("seeked", frame); media.removeEventListener("error", failed);
      media.removeAttribute("src"); media.load(); URL.revokeObjectURL(url);
    };
    const finish = (value?: MediaMetadata, error?: unknown) => {
      if (done) return; done = true; clean();
      if (error) reject(error); else resolve(value ?? metadata);
    };
    const abort = () => finish(undefined, signal?.reason ?? new DOMException("Aborted", "AbortError"));
    const failed = () => finish(undefined, new Error("Media preview is unavailable."));
    const frame = () => {
      if (done || capturing || kind !== "video" || media.readyState < 2 || media.seeking) return;
      const video = media as HTMLVideoElement;
      if (!video.videoWidth || !video.videoHeight) return;
      capturing = true;
      try {
        const scale = Math.min(1, 640 / video.videoWidth, 400 / video.videoHeight);
        const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(video.videoWidth * scale)); canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
        const context = canvas.getContext("2d");
        if (!context) { finish(metadata); return; }
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(image => finish({ ...metadata, ...(image ? { poster: image } : {}) }), "image/jpeg", .82);
      } catch (error) { finish(undefined, error); }
    };
    const loaded = () => {
      metadata = {
        ...(Number.isFinite(media.duration) && media.duration > 0 ? { durationMs: Math.round(media.duration * 1000) } : {}),
        ...(kind === "video" ? { width: (media as HTMLVideoElement).videoWidth, height: (media as HTMLVideoElement).videoHeight } : {}),
      };
      if (!poster || kind === "audio") { finish(metadata); return; }
      if (!seeking && Number.isFinite(media.duration) && media.duration > .1) {
        seeking = true; media.currentTime = Math.min(.15, media.duration / 4);
      } else frame();
    };
    const timeout = setTimeout(() => finish(metadata), 6000);
    media.muted = true; media.preload = "auto";
    if (kind === "video") (media as HTMLVideoElement).playsInline = true;
    signal?.addEventListener("abort", abort, { once: true });
    media.addEventListener("loadedmetadata", loaded); media.addEventListener("loadeddata", frame); media.addEventListener("seeked", frame); media.addEventListener("error", failed);
    media.src = url; media.load();
  });
}
