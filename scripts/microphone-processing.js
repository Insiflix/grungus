// Shared by the desktop renderer and isolated Element Call frame. No audio leaves this device.
(() => {
  const base = new URL('./', document.currentScript.src);
  let options = { echoCancellation: true, noiseSuppression: true, autoGainControl: true, advancedNoiseSuppression: false, voiceFilter: true, inputGain: 100, inputGate: false, inputThresholdDb: -45, inputCloseDb: -50, inputHoldMs: 200 };
  const sessions = new Set();
  const meters = new WeakMap();
  let revision = 0;
  const nativeConstraints = () => ({ echoCancellation: options.echoCancellation, noiseSuppression: options.noiseSuppression && !options.advancedNoiseSuppression, autoGainControl: options.autoGainControl, channelCount: { ideal: 1 }, sampleRate: { ideal: 48000 } });
  const report = (message) => window.dispatchEvent(new CustomEvent('grungus:audio-warning', { detail: message }));
  let library;
  const loadLibrary = () => library ??= import(new URL('vendor/index.js', base).href).catch(error => { library = undefined; throw error; });
  const process = async (stream) => {
    const input = stream.getAudioTracks()[0];
    if (!input) return stream;
    let context;
    try {
      context = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' });
      const source = context.createMediaStreamSource(new MediaStream([input]));
      const filter = context.createBiquadFilter();
      filter.type = 'highpass'; filter.frequency.value = 75; filter.Q.value = .707;
      const gain = context.createGain();
      await context.audioWorklet.addModule(new URL('microphone-gate.js', base).href);
      const gate = new AudioWorkletNode(context, 'grungus-microphone-gate', { channelCount: 1, outputChannelCount: [1] });
      let meter = { db: -100, open: !options.inputGate };
      gate.port.onmessage = event => { meter = event.data; };
      gate.onprocessorerror = () => {
        report('Input sensitivity stopped working. Rejoin the call or restart the microphone test.');
        // Fail closed rather than unexpectedly sending audio below the threshold.
        gate.disconnect();
      };
      const limiter = context.createDynamicsCompressor();
      limiter.threshold.value = -6; limiter.knee.value = 6; limiter.ratio.value = 12;
      limiter.attack.value = .003; limiter.release.value = .15;
      const destination = context.createMediaStreamDestination();
      destination.channelCount = 1;
      const outputs = new Set();
      let denoiser, closed = false, chain = Promise.resolve();
      const close = () => {
        if (closed) return;
        closed = true; sessions.delete(session);
        input.stop(); source.disconnect(); filter.disconnect(); gain.disconnect(); limiter.disconnect(); gate.disconnect(); gate.port.postMessage('destroy'); gate.port.close();
        denoiser?.destroy(); denoiser?.disconnect();
        void context.close().catch(() => {});
      };
      const decorateTrack = track => {
        outputs.add(track);
        meters.set(track, () => meter);
        const stop = track.stop.bind(track), clone = track.clone.bind(track);
        track.stop = () => { stop(); outputs.delete(track); if (!outputs.size) close(); };
        track.clone = () => decorateTrack(clone());
        track.getSettings = () => input.getSettings();
        track.getCapabilities = () => input.getCapabilities();
        track.getConstraints = () => input.getConstraints();
        track.applyConstraints = constraints => input.applyConstraints({ ...constraints, ...nativeConstraints() });
        return track;
      };
      const decorateStream = value => {
        value.getAudioTracks().forEach(decorateTrack);
        const clone = value.clone.bind(value);
        value.clone = () => decorateStream(clone());
        return value;
      };
      const update = async () => {
        if (closed) return;
        let useDenoiser = false;
        if (options.advancedNoiseSuppression) {
          try {
            if (!denoiser) {
              const { RnnoiseWorkletNode, loadRnnoise } = await loadLibrary();
              const binary = await loadRnnoise({ url: new URL('vendor/rnnoise.wasm', base).href, simdUrl: new URL('vendor/rnnoise_simd.wasm', base).href });
              await context.audioWorklet.addModule(new URL('vendor/rnnoise/workletProcessor.js', base).href);
              if (closed) return;
              denoiser = new RnnoiseWorkletNode(context, { maxChannels: 1, wasmBinary: binary });
              denoiser.onprocessorerror = () => {
                report('RNNoise stopped. Standard noise suppression is active; toggle RNNoise to retry.');
                source.disconnect(); source.connect(filter); denoiser.disconnect(); denoiser.destroy(); denoiser = undefined;
                void input.applyConstraints({ ...nativeConstraints(), noiseSuppression: options.noiseSuppression }).catch(() => {});
              };
            }
            useDenoiser = options.advancedNoiseSuppression;
          } catch {
            report('RNNoise is unavailable. Standard noise suppression is active.');
          }
        }
        if (closed) return;
        await input.applyConstraints({ ...nativeConstraints(), noiseSuppression: useDenoiser ? false : options.noiseSuppression });
        if (closed) return;
        source.disconnect(); filter.disconnect(); gain.disconnect(); gate.disconnect(); limiter.disconnect(); denoiser?.disconnect();
        let tail = source;
        if (useDenoiser) { tail.connect(denoiser); tail = denoiser; }
        // A gentle rumble filter and peak limiter retain natural voice without an aggressive gate.
        filter.frequency.setTargetAtTime(options.voiceFilter ? 75 : 0, context.currentTime, .02);
        tail.connect(filter); filter.connect(gain);
        gain.gain.setTargetAtTime(options.inputGain / 100, context.currentTime, .02);
        gate.port.postMessage({ enabled: options.inputGate, thresholdDb: options.inputThresholdDb, closeDb: options.inputCloseDb, holdMs: options.inputHoldMs });
        gain.connect(gate);
        if (options.voiceFilter) { gate.connect(limiter); limiter.connect(destination); }
        else gate.connect(destination);
      };
      const session = { update: () => chain = chain.catch(() => {}).then(update), close };
      sessions.add(session);
      input.addEventListener('ended', () => { for (const output of [...outputs]) { output.stop(); output.dispatchEvent(new Event('ended')); } close(); }, { once: true });
      const output = destination.stream.getAudioTracks()[0];
      stream.removeTrack(input); stream.addTrack(output); decorateStream(stream);
      await session.update(); await context.resume();
      return stream;
    } catch (error) {
      // A failed initialization must release the native capture as well.
      stream.getTracks().forEach(track => track.stop()); input.stop();
      if (context && context.state !== 'closed') await context.close().catch(() => {});
      throw error;
    }
  };
  const configure = async next => {
    const before = JSON.stringify(options);
    for (const key of ['echoCancellation', 'noiseSuppression', 'autoGainControl', 'advancedNoiseSuppression', 'voiceFilter', 'inputGate']) if (typeof next?.[key] === 'boolean') options[key] = next[key];
    if (Number.isFinite(next?.inputGain)) options.inputGain = Math.max(0, Math.min(200, next.inputGain));
    for (const [key, min, max] of [['inputThresholdDb', -90, 0], ['inputCloseDb', -90, 0], ['inputHoldMs', 0, 1000]]) if (Number.isFinite(next?.[key])) options[key] = Math.max(min, Math.min(max, next[key]));
    options.inputCloseDb = Math.min(options.inputCloseDb, options.inputThresholdDb);
    if (JSON.stringify(options) === before) return;
    const current = ++revision;
    const results = await Promise.allSettled([...sessions].map(session => session.update()));
    if (current === revision && results.some(result => result.status === 'rejected')) throw new Error('Microphone settings could not be applied. Reconnect your microphone and retry.');
  };
  const media = navigator.mediaDevices;
  if (media?.getUserMedia) {
    const original = media.getUserMedia.bind(media);
    media.getUserMedia = async constraints => {
      const audio = constraints?.audio;
      const screen = typeof constraints?.video === 'object' && (constraints.video.mandatory?.chromeMediaSource || constraints.video.mediaSource);
      if (!audio || screen) return original(constraints);
      const stream = await original({ ...constraints, audio: { ...(typeof audio === 'object' ? audio : {}), ...nativeConstraints() } });
      return process(stream);
    };
  }
  window.addEventListener('pagehide', () => { for (const session of sessions) session.close(); });
  window.grungusAudio = { configure, getLevel: track => meters.get(track)?.() };
})();
