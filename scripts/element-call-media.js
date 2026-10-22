// Loaded before Element Call: keep its device controls, adapt capture constraints locally.
(() => {
  const presets = __GRUNGUS_CAMERA_PRESETS__;
  const params = new URLSearchParams(location.hash.replace(/^#\??/, ""));
  const parentOrigin = new URL(params.get("parentUrl")).origin;
  let quality = params.get("grungusCameraQuality") || "720p";
  if (!Object.hasOwn(presets, quality)) quality = "720p";
  const cameraTracks = new Set();
  const media = navigator.mediaDevices;
  const originalGetUserMedia = media.getUserMedia.bind(media);
  const constraintsFor = (value) => {
    const preset = presets[value];
    return { width: { ideal: preset.width, max: preset.width }, height: { ideal: preset.height, max: preset.height }, frameRate: { ideal: preset.frameRate, max: preset.frameRate } };
  };
  const sendStatus = (data) => parent.postMessage({ type: "grungus:media-status", widgetId: params.get("widgetId"), ...data }, parentOrigin);
  // Track the actual media connections, including publisher/subscriber reconnects.
  const connections = new Set();
  if (window.RTCPeerConnection) {
    window.RTCPeerConnection = new Proxy(window.RTCPeerConnection, {
      construct(Target, args, NewTarget) {
        const connection = Reflect.construct(Target, args, NewTarget);
        connections.add(connection);
        connection.addEventListener("connectionstatechange", () => {
          if (connection.connectionState === "closed") connections.delete(connection);
        });
        return connection;
      },
    });
  }
  const connectionPing = async () => {
    const samples = [];
    await Promise.allSettled([...connections].map(async connection => {
      if (connection.connectionState === "closed") { connections.delete(connection); return; }
      if (connection.connectionState !== "connected") return;
      const stats = await connection.getStats();
      const selected = new Set();
      stats.forEach(report => { if (report.type === "transport" && report.selectedCandidatePairId) selected.add(report.selectedCandidatePairId); });
      stats.forEach(report => {
        if (report.type === "candidate-pair" && report.state === "succeeded" &&
          (selected.size ? selected.has(report.id) : report.nominated) &&
          Number.isFinite(report.currentRoundTripTime) && report.currentRoundTripTime >= 0) samples.push(report.currentRoundTripTime * 1000);
      });
    }));
    return samples.length ? Math.round(Math.max(...samples)) : null;
  };
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
    const fromHost = event.source === parent && event.origin === parentOrigin && data?.widgetId === params.get("widgetId");
    if (fromHost && data.type === "grungus:connection-stats") {
      sendStatus({ pingMs: await connectionPing() });
      return;
    }
    if (fromHost && data.type === "grungus:host-controls" && typeof data.enabled === "boolean") {
      document.documentElement.toggleAttribute("data-grungus-host-controls", data.enabled);
      for (const key of ["background", "surface", "text", "muted", "accent", "border"]) {
        if (typeof data.colors?.[key] === "string") document.documentElement.style.setProperty(`--grungus-${key}`, data.colors[key]);
      }
      return;
    }
    if (fromHost && data.type === "grungus:toggle-screenshare") {
      // Element Call publishes/unpublishes the capture itself; do not create an orphan stream here.
      const button = document.querySelector('button[data-testid="incall_screenshare"]');
      if (!button || button.disabled) sendStatus({ shareError: "Screen sharing is not available yet. Wait for the call to connect and try again." });
      else {
        button.click();
        sendStatus({ shareAction: true });
      }
      return;
    }
    if (event.source === parent && event.origin === parentOrigin && data?.type === "grungus:deafen" && data.widgetId === params.get("widgetId") && typeof data.deafened === "boolean") {
      try {
        window.controls.setAudioEnabled(!data.deafened);
        sendStatus({ deafened: data.deafened });
      } catch {
        sendStatus({ deafenError: "Audio output could not be changed. Please try again." });
      }
      return;
    }
    if (event.source !== parent || event.origin !== parentOrigin || data?.type !== "grungus:camera-quality" || data.widgetId !== params.get("widgetId") || !Object.hasOwn(presets, data.quality)) return;
    const next = data.quality;
    const active = [...cameraTracks].filter(track => track.readyState === "live");
    const results = await Promise.allSettled(active.map(track => track.applyConstraints(constraintsFor(next))));
    const failed = results.some(result => result.status === "rejected");
    if (!failed) quality = next;
    else await Promise.allSettled(active.map(track => track.applyConstraints(constraintsFor(quality))));
    sendStatus({ quality: failed ? quality : next, qualityError: failed ? "Die Kamera unterstützt diese Qualität nicht." : null });
  });
})();
