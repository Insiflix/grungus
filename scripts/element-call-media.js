// Loaded before Element Call: keep its device controls, adapt capture constraints locally.
(() => {
  const presets = __GRUNGUS_CAMERA_PRESETS__;
  const params = new URLSearchParams(location.hash.replace(/^#\??/, ""));
  const parentOrigin = new URL(params.get("parentUrl")).origin;
  // LiveKit can pass an unset output device before device discovery finishes.
  // Chromium requires an explicit empty string to select the default output.
  const audioContextPrototype = window.AudioContext?.prototype;
  if (audioContextPrototype?.setSinkId) {
    const setSinkId = audioContextPrototype.setSinkId;
    audioContextPrototype.setSinkId = function (deviceId) { return setSinkId.call(this, deviceId ?? ""); };
  }
  try { void window.grungusAudio?.configure(JSON.parse(params.get("grungusAudio") || "{}")).catch(() => {}); } catch { /* Use speech defaults for malformed settings. */ }
  let quality = params.get("grungusCameraQuality") || "720p";
  if (!Object.hasOwn(presets, quality)) quality = "720p";
  // The build adds a hook where Element maps Matrix users to LiveKit participants.
  // Use that authoritative mapping; display names and DOM positions are ambiguous.
  const participants = new Map();
  const participantSettings = new Map();
  const wrappedParticipants = new WeakMap();
  const sources = ["microphone", "screen_share_audio"];
  const applyParticipant = entry => {
    const settings = participantSettings.get(entry.userId) ?? { volume: 100, muted: false };
    const gain = settings.muted ? 0 : settings.volume / 100;
    for (const source of sources) entry.original((entry.base.get(source) ?? 1) * gain, source);
  };
  window.grungusRegisterParticipant = (userId, identity, participant) => {
    if (typeof userId !== "string" || typeof identity !== "string") return;
    const key = JSON.stringify([userId, identity]);
    if (!participant) { participants.delete(key); return; }
    if (participants.get(key)?.participant === participant) return;
    let entry = wrappedParticipants.get(participant);
    if (!entry) {
      entry = { userId, participant, original: participant.setVolume?.bind(participant) ?? (() => {}), base: new Map() };
      wrappedParticipants.set(participant, entry);
      participant.setVolume = (value, source = "microphone") => {
        entry.base.set(source, value);
        const settings = participantSettings.get(entry.userId) ?? { volume: 100, muted: false };
        entry.original(value * (settings.muted ? 0 : settings.volume / 100), source);
      };
    }
    entry.userId = userId;
    participants.set(key, entry);
    if (participantSettings.has(userId)) applyParticipant(entry);
  };
  const cameraTracks = new Set();
  const media = navigator.mediaDevices;
  const originalGetUserMedia = media.getUserMedia.bind(media);
  const constraintsFor = (value) => {
    const preset = presets[value];
    return { width: { ideal: preset.width, max: preset.width }, height: { ideal: preset.height, max: preset.height }, frameRate: { ideal: preset.frameRate, max: preset.frameRate } };
  };
  const sendStatus = (data) => parent.postMessage({ type: "grungus:media-status", widgetId: params.get("widgetId"), ...data }, parentOrigin);
  let linuxAudio = false;
  let audioReply = null;
  const requestLinuxAudio = () => new Promise((resolve, reject) => {
    const timer = setTimeout(() => { audioReply = null; reject(new Error("Computer audio did not respond.")); }, 15000);
    audioReply = data => { clearTimeout(timer); audioReply = null; data.error ? reject(new Error(data.error)) : resolve(data.label); };
    sendStatus({ linuxAudioRequest: true });
  });
  let watched = null;
  let lastActivity = "";
  const updateActivity = () => {
    const members = new Map();
    for (const { userId, participant } of participants.values()) {
      const previous = members.get(userId);
      members.set(userId, { userId, name: participant.name || userId, speaking: Boolean(previous?.speaking || participant.isSpeaking), screen: Boolean(previous?.screen || participant.isScreenShareEnabled), camera: Boolean(previous?.camera || participant.isCameraEnabled) });
    }
    const activity = [...members.values()];
    const signature = JSON.stringify(activity);
    if (signature !== lastActivity) { lastActivity = signature; sendStatus({ activity }); }
    const trackIds = new Set();
    if (watched) for (const entry of participants.values()) {
      if (entry.userId !== watched.userId) continue;
      for (const publication of entry.participant.videoTrackPublications?.values() ?? []) {
        if (publication.source === watched.source && !publication.isMuted && publication.track?.mediaStreamTrack) trackIds.add(publication.track.mediaStreamTrack.id);
      }
    }
    for (const ancestor of document.querySelectorAll?.(".grungus-watch-ancestor") ?? []) ancestor.classList.remove("grungus-watch-ancestor");
    for (const video of document.querySelectorAll?.("video") ?? []) {
      const selected = [...(video.srcObject?.getVideoTracks?.() ?? [])].some(track => trackIds.has(track.id));
      video.classList.toggle("grungus-watched-video", selected);
      if (selected) for (let ancestor = video.parentElement; ancestor; ancestor = ancestor.parentElement) ancestor.classList.add("grungus-watch-ancestor");
    }
  };
  window.setInterval?.(updateActivity, 150);
  window.addEventListener("grungus:audio-warning", event => sendStatus({ audioError: event.detail }));
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
      let systemStream;
      if (linuxAudio && !stream.getAudioTracks().length) {
        try {
          const label = await requestLinuxAudio();
          if (label) {
            let device;
            for (let attempt = 0; attempt < 15; attempt++) {
              device = (await media.enumerateDevices()).find(item => item.kind === "audioinput" && item.label === label);
              if (device) break;
              await new Promise(resolve => setTimeout(resolve, 200));
            }
            if (!device) throw new Error("Computer audio input was not found. Check PipeWire/PulseAudio and try again.");
            systemStream = await window.grungusAudio.captureSystemAudio(device.deviceId);
            for (const track of systemStream.getAudioTracks()) stream.addTrack(track);
          }
        } catch (error) {
          stream.getTracks().forEach(track => track.stop());
          systemStream?.getTracks().forEach(track => track.stop());
          sendStatus({ linuxAudioStop: true, shareError: error.message });
          throw error;
        }
      }
      const audio = stream.getAudioTracks().length > 0;
      sendStatus({ sharing: true, systemAudio: audio });
      for (const track of stream.getVideoTracks()) {
        const stopped = () => { systemStream?.getTracks().forEach(track => track.stop()); sendStatus({ sharing: false, systemAudio: false, linuxAudioStop: linuxAudio }); };
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
    if (fromHost && data.type === "grungus:linux-audio") { audioReply?.(data); return; }
    if (fromHost && data.type === "grungus:watch-media") {
      watched = typeof data.userId === "string" && ["screen_share", "camera"].includes(data.source) ? { userId: data.userId, source: data.source } : null;
      document.documentElement.toggleAttribute("data-grungus-pip", Boolean(watched && data.compact));
      document.documentElement.toggleAttribute("data-grungus-watch", Boolean(watched));
      updateActivity();
      return;
    }
    if (fromHost && data.type === "grungus:participant-audio") {
      const reply = { requestId: data.requestId, userId: data.userId };
      try {
        if (typeof data.userId !== "string" || !Number.isFinite(data.volume) || data.volume < 0 || data.volume > 200 || typeof data.muted !== "boolean") throw new Error("Invalid participant audio settings.");
        const entries = [...participants.values()].filter(entry => entry.userId === data.userId);
        // Keep settings for members whose media is still connecting or reconnecting.
        participantSettings.set(data.userId, { volume: data.volume, muted: data.muted });
        for (const entry of entries) applyParticipant(entry);
        sendStatus({ participantAudio: { ...reply, success: true } });
      } catch {
        sendStatus({ participantAudio: { ...reply, error: "Unable to adjust this user's audio. Rejoin the channel and retry." } });
      }
      return;
    }
    if (fromHost && data.type === "grungus:audio-settings") {
      try {
        if (!window.grungusAudio) throw new Error("Microphone processing is unavailable. Rejoin the call.");
        await window.grungusAudio.configure(data.options);
        sendStatus({ audioError: null });
      } catch { sendStatus({ audioError: "Microphone settings could not be applied. Rejoin the call and retry." }); }
      return;
    }
    if (fromHost && data.type === "grungus:connection-stats") {
      sendStatus({ pingMs: await connectionPing() });
      return;
    }
    if (fromHost && data.type === "grungus:host-controls" && typeof data.enabled === "boolean") {
      linuxAudio = data.linuxAudio === true;
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
