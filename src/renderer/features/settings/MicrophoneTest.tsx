import { useEffect, useRef, useState } from "react";
import type { Preferences } from "../../../domain/settings/Preferences";

/** Local monitoring and recordings use the outgoing, processed microphone stream. */
export function MicrophoneTest({ prefs, disabled }: { prefs: Preferences; disabled: boolean }) {
  const [active, setActive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [mirror, setMirror] = useState(true);
  const [level, setLevel] = useState(0);
  const [gateLevel, setGateLevel] = useState<{ db: number; open: boolean } | null>(null);
  const [recording, setRecording] = useState(false);
  const [clip, setClip] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const monitor = useRef<HTMLAudioElement>(null);
  const playback = useRef<HTMLAudioElement>(null);
  const resources = useRef<{ stream: MediaStream; context: AudioContext; frame: number; recorder?: MediaRecorder; timer?: ReturnType<typeof setTimeout> } | null>(null);
  const generation = useRef(0);
  const clipUrl = useRef<string | null>(null);
  const mirrorRef = useRef(mirror); mirrorRef.current = mirror;
  const clearClip = () => { if (clipUrl.current) URL.revokeObjectURL(clipUrl.current); clipUrl.current = null; setClip(null); };
  const release = () => {
    generation.current++;
    const current = resources.current; resources.current = null;
    if (current) {
      cancelAnimationFrame(current.frame); clearTimeout(current.timer);
      if (current.recorder?.state !== undefined && current.recorder.state !== "inactive") { current.recorder.onstop = null; current.recorder.stop(); }
      current.stream.getTracks().forEach(track => track.stop());
      void current.context.close().catch(() => {});
    }
    if (monitor.current) { monitor.current.pause(); monitor.current.srcObject = null; }
  };
  const stop = () => { release(); setActive(false); setStarting(false); setRecording(false); setLevel(0); setGateLevel(null); };
  useEffect(() => { stop(); clearClip(); return () => { release(); if (clipUrl.current) URL.revokeObjectURL(clipUrl.current); }; }, [prefs.audioInput]);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        for (const element of [monitor.current, playback.current]) {
          const output = element as (HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }) | null;
          if (output?.setSinkId) await output.setSinkId(prefs.audioOutput || "");
        }
      } catch { if (!cancelled) { stop(); setError("The selected speaker is unavailable. Select another output and retry."); } }
    })();
    return () => { cancelled = true; };
  }, [prefs.audioOutput, clip]);
  useEffect(() => { if (monitor.current) monitor.current.muted = !mirror || recording; }, [mirror, recording]);
  const start = async () => {
    const request = ++generation.current;
    setStarting(true); setError(null); clearClip();
    let stream: MediaStream | undefined, context: AudioContext | undefined;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { ...(prefs.audioInput ? { deviceId: { exact: prefs.audioInput } } : {}), echoCancellation: prefs.echoCancellation, noiseSuppression: prefs.noiseSuppression, autoGainControl: prefs.autoGainControl } });
      if (generation.current !== request) { stream.getTracks().forEach(track => track.stop()); return; }
      context = new AudioContext(); await context.resume();
      if (generation.current !== request) { stream.getTracks().forEach(track => track.stop()); await context.close(); return; }
      const analyser = context.createAnalyser(); analyser.fftSize = 1024;
      context.createMediaStreamSource(stream).connect(analyser);
      const samples = new Float32Array(analyser.fftSize);
      const current = { stream, context, frame: 0 };
      resources.current = current;
      const tick = () => {
        if (resources.current !== current) return;
        analyser.getFloatTimeDomainData(samples);
        const peak = samples.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
        setGateLevel(window.grungusAudio?.getLevel(stream!.getAudioTracks()[0]) ?? null);
        setLevel(Math.min(100, Math.round(peak * 100)));
        current.frame = requestAnimationFrame(tick);
      };
      const audio = monitor.current!;
      audio.srcObject = stream; audio.muted = !mirrorRef.current;
      const output = audio as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
      if (output.setSinkId) await output.setSinkId(prefs.audioOutput || "");
      if (generation.current !== request) return;
      await audio.play();
      if (generation.current !== request) return;
      stream.getAudioTracks().forEach(track => track.addEventListener("ended", () => { if (resources.current === current) { stop(); setError("Microphone disconnected. Select a device and retry."); } }, { once: true }));
      tick(); setActive(true);
    } catch (cause) {
      stream?.getTracks().forEach(track => track.stop());
      if (context && context.state !== "closed") void context.close().catch(() => {});
      if (generation.current === request) { stop(); setError(cause instanceof Error ? cause.message : "Microphone test could not start."); }
    } finally { if (generation.current === request) setStarting(false); }
  };
  const record = () => {
    const current = resources.current;
    if (!current) return;
    if (recording) { clearTimeout(current.timer); current.recorder?.stop(); return; }
    try {
      clearClip(); playback.current?.pause();
      const recorder = new MediaRecorder(current.stream); current.recorder = recorder;
      const chunks: Blob[] = [];
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = () => {
        if (resources.current !== current) return;
        clearTimeout(current.timer); setRecording(false);
        clipUrl.current = URL.createObjectURL(new Blob(chunks, { type: recorder.mimeType })); setClip(clipUrl.current);
        // Keep the microphone muted during playback to avoid hearing both at once.
        setMirror(false);
      };
      recorder.onerror = () => { clearTimeout(current.timer); setRecording(false); setError("Recording failed. Please retry."); };
      recorder.start(); setRecording(true);
      current.timer = setTimeout(() => { if (recorder.state === "recording") recorder.stop(); }, 10000);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Recording is unavailable."); }
  };
  return <div className="microphone-test">
    <p>Hear your outgoing microphone with the same processing as calls. Use headphones for live mirroring. This local test does not simulate network quality.</p>
    <div className="settings-actions"><button className="button button--secondary" disabled={disabled || !navigator.mediaDevices || starting} onClick={() => active ? stop() : void start()}>{starting ? "Starting microphone…" : active ? "Stop microphone test" : "Start microphone test"}</button>
      <label><input type="checkbox" checked={mirror} onChange={event => setMirror(event.target.checked)} /> Hear myself (mirror)</label>
      {active && typeof MediaRecorder !== "undefined" && <button className="button button--secondary" onClick={record}>{recording ? "Finish recording" : "Record 10-second sample"}</button>}
    </div>
    <audio ref={monitor} autoPlay />
    {active && <div><label>Microphone level <meter aria-label="Microphone level" min={0} max={100} high={90} value={level} /> {level}%</label>{gateLevel && <p>Input before gate: {gateLevel.db.toFixed(1)} dBFS <meter aria-label="Input level before gate" min={-100} max={0} value={gateLevel.db} /> {prefs.inputGate ? gateLevel.open ? "Passing microphone audio" : "Below threshold - microphone audio blocked" : "Custom sensitivity off"}</p>}<p role="status">{recording ? "Recording locally… Live mirror is paused." : level >= 95 ? "Input is too loud. Reduce microphone gain." : "Microphone test active."}</p></div>}
    {clip && <div><p>Your processed microphone recording (stored locally until you close settings):</p><audio ref={playback} src={clip} controls onPlay={() => setMirror(false)} /></div>}
    {error && <p className="settings-inline-error" role="alert">{error}</p>}
  </div>;
}
