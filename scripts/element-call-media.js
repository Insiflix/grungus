// Loaded before Element Call: keep its device controls, adapt capture constraints locally.
(() => {
  const presets = __GRUNGUS_CAMERA_PRESETS__;
  const params = new URLSearchParams(location.hash.replace(/^#\??/, ""));
  let quality = params.get("grungusCameraQuality") || "720p";
  if (!Object.hasOwn(presets, quality)) quality = "720p";
  const cameraTracks = new Set();
  const media = navigator.mediaDevices;
  const originalGetUserMedia = media.getUserMedia.bind(media);
  const constraintsFor = (value) => {
    const preset = presets[value];
    return { width: { ideal: preset.width, max: preset.width }, height: { ideal: preset.height, max: preset.height }, frameRate: { ideal: preset.frameRate, max: preset.frameRate } };
  };
  const sendStatus = (data) => parent.postMessage({ type: "grungus:media-status", widgetId: params.get("widgetId"), ...data }, location.origin);
  media.getUserMedia = async (constraints) => {
    const video = constraints?.video;
    const isCamera = video && !(typeof video === "object" && (video.mandatory?.chromeMediaSource || video.mediaSource));
    const captureQuality = quality;
    const stream = await originalGetUserMedia(isCamera ? { ...constraints, video: { ...(typeof video === "object" ? video : {}), ...constraintsFor(quality) } } : constraints);
    if (isCamera) for (const track of stream.getVideoTracks()) {
      if (captureQuality !== quality) await track.applyConstraints(constraintsFor(quality));
      cameraTracks.add(track);
      track.addEventListener("ended", () => cameraTracks.delete(track), { once: true });
    }
    return stream;
  };
  if (media.getDisplayMedia) {
    const originalGetDisplayMedia = media.getDisplayMedia.bind(media);
    media.getDisplayMedia = async (constraints) => {
      // The native picker still requires explicit source/audio confirmation.
      const stream = await originalGetDisplayMedia({ ...constraints, video: constraints?.video || true, audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, systemAudio: "include" });
      const audio = stream.getAudioTracks().length > 0;
      sendStatus({ sharing: true, systemAudio: audio });
      for (const track of stream.getVideoTracks()) {
        const stopped = () => sendStatus({ sharing: false, systemAudio: false });
        track.addEventListener("ended", stopped, { once: true });
        const originalStop = track.stop.bind(track);
        track.stop = () => { originalStop(); stopped(); };
      }
      return stream;
    };
  }
  window.addEventListener("message", async (event) => {
    const data = event.data;
    if (event.source !== parent || event.origin !== location.origin || data?.type !== "grungus:camera-quality" || data.widgetId !== params.get("widgetId") || !Object.hasOwn(presets, data.quality)) return;
    const next = data.quality;
    const active = [...cameraTracks].filter(track => track.readyState === "live");
    const results = await Promise.allSettled(active.map(track => track.applyConstraints(constraintsFor(next))));
    const failed = results.some(result => result.status === "rejected");
    if (!failed) quality = next;
    else await Promise.allSettled(active.map(track => track.applyConstraints(constraintsFor(quality))));
    sendStatus({ quality: failed ? quality : next, qualityError: failed ? "Die Kamera unterstützt diese Qualität nicht." : null });
  });
})();
