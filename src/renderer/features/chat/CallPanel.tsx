import { microphoneOptions } from "../../../infrastructure/desktop/Microphone";
import { preferences } from "../../../domain/settings/Preferences";
import type { ICallProvider, CallHandle } from "../../../domain/calls/ICallProvider";
import { CameraQualitySelect } from "./CameraQualitySelect";
import { isCameraQuality, loadCameraQuality, saveCameraQuality, type CameraQuality } from "../../../domain/calls/CameraQuality";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Headphones, HeadphoneOff, Maximize2, Minimize2, PhoneOff, Mic, MicOff, Video, VideoOff, MonitorUp, Signal } from "lucide-react";
import { createPortal } from "react-dom";
import { mountCall } from "../../app/providers/MatrixProvider";
import { VoiceChatToggle } from "./VoiceChatToggle";
export function CallPanel({ roomId, name, video, mode = "group", autoJoin = mode === "voice" && !video, chat, search, chatVisible = true, chatUnreadCount = 0, onToggleChat, dock, visible = true, onOpen, onClose, mount = mountCall }: { roomId: string; name: string; video: boolean; mode?: "voice" | "group"; autoJoin?: boolean; chat?: ReactNode; search?: ReactNode; chatVisible?: boolean; chatUnreadCount?: number; onToggleChat?: () => void; dock?: HTMLElement | null; visible?: boolean; onOpen?: () => void; onClose: () => void; mount?: ICallProvider["mountCall"] }) {
  const callHandle = useRef<CallHandle | null>(null);
  const [quality, setQuality] = useState(loadCameraQuality);
  const [qualityPending, setQualityPending] = useState(false);
  const qualityTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [sharing, setSharing] = useState<{ active: boolean; audio: boolean }>({ active: false, audio: false });
  const [leaving, setLeaving] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const [joined, setJoined] = useState(false);
  const [ping, setPing] = useState<number | null>(null);
  const connectionTooltip = !joined ? "Connecting to voice..." : ping === null ? "Ping unavailable" : `Ping: ${ping} ms`;
  useEffect(() => {
    setPing(null);
    if (!joined) return;
    const poll = () => {
      if (!frame.current?.src) return;
      const url = new URL(frame.current.src);
      frame.current.contentWindow?.postMessage({ type: "grungus:connection-stats", widgetId: new URLSearchParams(url.hash.slice(2)).get("widgetId") }, url.origin);
    };
    poll();
    const timer = setInterval(poll, 5000);
    return () => clearInterval(timer);
  }, [joined, roomId]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const update = () => {
      if (!frame.current?.src || loading) return;
      const url = new URL(frame.current.src);
      frame.current.contentWindow?.postMessage({ type: "grungus:audio-settings", widgetId: new URLSearchParams(url.hash.slice(2)).get("widgetId"), options: microphoneOptions() }, url.origin);
    };
    update();
    return preferences.subscribe(update);
  }, [loading, roomId]);
  const [minimized, setMinimized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState({ audio_enabled: true, video_enabled: video });
  const [deafened, setDeafened] = useState(false);
  const [pending, setPending] = useState(false);
  const restoreMicrophone = useRef(true);
  const deafenTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [sharePending, setSharePending] = useState(false);
  const shareTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const docked = mode === "voice" && (joined || autoJoin) && Boolean(dock);
  useEffect(() => {
    const focus = (event: Event) => { if ((event as CustomEvent).detail?.roomId === roomId) setMinimized(false); };
    window.addEventListener("grungus:focus-message", focus);
    return () => window.removeEventListener("grungus:focus-message", focus);
  }, [roomId]);
  useEffect(() => {
    const update = () => {
      if (!frame.current?.src || loading) return;
      const url = new URL(frame.current.src);
      const style = getComputedStyle(document.documentElement);
      const colors = Object.fromEntries(Object.entries({ background: "--bg-base", surface: "--surface-3", text: "--text", muted: "--text-soft", accent: "--accent", border: "--border-strong" }).map(([key, variable]) => [key, style.getPropertyValue(variable).trim()]));
      frame.current.contentWindow?.postMessage({ type: "grungus:host-controls", widgetId: new URLSearchParams(url.hash.slice(2)).get("widgetId"), enabled: docked, colors }, url.origin);
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "style", "class"] });
    return () => observer.disconnect();
  }, [docked, loading]);
  useEffect(() => {
    const element = frame.current;
    const update = (event: Event) => setDevices((event as CustomEvent).detail);
    element?.addEventListener("grungus:devices", update);
    return () => element?.removeEventListener("grungus:devices", update);
  }, []);
  useEffect(() => {
    if (deafened && devices.audio_enabled) void callHandle.current?.setDevices?.({ audio_enabled: false }).catch(() => setError("Could not mute your microphone. Please leave voice and rejoin."));
  }, [deafened, devices.audio_enabled]);
  useEffect(() => {
    if (!frame.current) return;
    const timeout = setTimeout(() => { setLoading(false); setError(autoJoin ? "Could not connect to voice. Cancel and try joining again." : "Element Call is not responding. Please reopen it; details are in the developer console."); }, 20000);
    try {
      const handle = mount(frame.current, roomId, video, onClose, () => { if (!autoJoin) clearTimeout(timeout); setLoading(false); }, () => { clearTimeout(timeout); setLoading(false); setJoined(true); }, { skipLobby: autoJoin });
      callHandle.current = handle;
      return () => { clearTimeout(timeout); handle.dispose(); callHandle.current = null; };
    }
    catch (error) { clearTimeout(timeout); setLoading(false); setError(error instanceof Error ? error.message : "Unable to start call"); }
  }, [roomId, video, onClose, mount, autoJoin]);
  useEffect(() => {
    const listener = (event: MessageEvent) => {
      const data = event.data;
      const widgetId = frame.current ? new URLSearchParams(new URL(frame.current.src).hash.slice(2)).get("widgetId") : null;
      if (!frame.current || event.source !== frame.current.contentWindow || event.origin !== new URL(frame.current.src).origin || data?.type !== "grungus:media-status" || data.widgetId !== widgetId) return;
      if (Object.hasOwn(data, "pingMs")) setPing(typeof data.pingMs === "number" && Number.isFinite(data.pingMs) && data.pingMs >= 0 ? Math.round(data.pingMs) : null);
      if (isCameraQuality(data.quality)) { clearTimeout(qualityTimeout.current); setQualityPending(false); setQuality(data.quality); if (!data.qualityError) saveCameraQuality(data.quality); setError(data.qualityError ?? null); }
      if (typeof data.audioError === "string") setError(data.audioError);
      if (typeof data.fullscreenError === "string") setError(data.fullscreenError);
      if (typeof data.sharing === "boolean") setSharing({ active: data.sharing, audio: Boolean(data.systemAudio) });
      if (typeof data.sharing === "boolean" || data.shareAction || data.shareError) {
        clearTimeout(shareTimeout.current); setSharePending(false);
        if (data.shareError) setError(data.shareError);
      }
      if (typeof data.deafened === "boolean" || data.deafenError) {
        clearTimeout(deafenTimeout.current);
        setPending(false);
        if (data.deafenError) setError(data.deafenError);
        else {
          setDeafened(data.deafened);
          if (!data.deafened) void callHandle.current?.setDevices?.({ audio_enabled: restoreMicrophone.current }).then(setDevices).catch(() => setError("Could not restore your microphone. Use the microphone control to retry."));
        }
      }
    };
    window.addEventListener("message", listener);
    return () => { window.removeEventListener("message", listener); clearTimeout(qualityTimeout.current); clearTimeout(deafenTimeout.current); clearTimeout(shareTimeout.current); };
  }, []);
  const setDevice = async (state: { audio_enabled?: boolean; video_enabled?: boolean }) => {
    if (!callHandle.current?.setDevices) return;
    setPending(true); setError(null);
    try { setDevices(await callHandle.current.setDevices(state)); }
    catch { setError("Could not change your device. Please try again."); }
    finally { setPending(false); }
  };
  const toggleDeafen = async () => {
    if (!frame.current || !callHandle.current?.setDevices) return;
    setPending(true); setError(null);
    try {
      if (!deafened) {
        restoreMicrophone.current = devices.audio_enabled;
        setDevices(await callHandle.current.setDevices({ audio_enabled: false }));
      }
      const url = new URL(frame.current.src);
      frame.current.contentWindow?.postMessage({ type: "grungus:deafen", widgetId: new URLSearchParams(url.hash.slice(2)).get("widgetId"), deafened: !deafened }, url.origin);
      clearTimeout(deafenTimeout.current);
      deafenTimeout.current = setTimeout(() => { setPending(false); setError("Audio output did not respond. Please try again."); }, 5000);
    } catch { setPending(false); setError("Could not change your audio. Please try again."); }
  };
  const leave = () => { setLeaving(true); if (callHandle.current) void callHandle.current.hangup(); else onClose(); };
  const open = () => { setMinimized(false); onOpen?.(); };
  const toggleScreenshare = () => {
    if (!frame.current) return;
    open();
    const url = new URL(frame.current.src);
    setSharePending(true); setError(null);
    // Capture requests from a hidden/unfocused document can stall. Reveal the call before dispatch.
    requestAnimationFrame(() => {
      frame.current?.focus();
      frame.current?.contentWindow?.postMessage({ type: "grungus:toggle-screenshare", widgetId: new URLSearchParams(url.hash.slice(2)).get("widgetId") }, url.origin);
    });
    clearTimeout(shareTimeout.current);
    shareTimeout.current = setTimeout(() => { setSharePending(false); setError("Screen sharing did not respond. Please try again."); }, 5000);
  };
  const changeQuality = (next: CameraQuality) => {
    if (!frame.current) return;
    setQualityPending(true);
    const widgetId = new URLSearchParams(new URL(frame.current.src).hash.slice(2)).get("widgetId");
    frame.current.contentWindow?.postMessage({ type: "grungus:camera-quality", quality: next, widgetId }, new URL(frame.current.src).origin);
    clearTimeout(qualityTimeout.current);
    qualityTimeout.current = setTimeout(() => { setQualityPending(false); setError("Unable to apply camera setting."); }, 5000);
  };
  return <>{docked && createPortal(<section className="voice-dock" aria-label="Voice controls">
    <div className="voice-dock__connection"><Signal size={21} aria-label={connectionTooltip} data-tooltip={connectionTooltip} /><button className="voice-dock__room" onClick={open} data-tooltip={connectionTooltip}><strong>{error ? "Connection problem" : joined ? "Voice Connected" : "Connecting…"}</strong><small>{name}</small></button><button className="icon-button voice-dock__disconnect" data-tooltip="Disconnect" aria-label="Disconnect from voice" disabled={leaving} onClick={leave}><PhoneOff size={18} /></button></div>
    <div className="voice-dock__actions">
      <button aria-label={devices.video_enabled ? "Turn camera off" : "Turn camera on"} data-tooltip={devices.video_enabled ? "Turn camera off" : "Turn camera on"} aria-pressed={devices.video_enabled} disabled={pending || !joined} onClick={() => void setDevice({ video_enabled: !devices.video_enabled })}>{devices.video_enabled ? <Video size={19} /> : <VideoOff size={19} />}</button>
      <button aria-label={sharing.active ? "Stop sharing screen" : "Share screen"} data-tooltip={sharing.active ? "Stop sharing screen" : "Share screen"} aria-pressed={sharing.active} disabled={sharePending || leaving || !joined} onClick={toggleScreenshare}><MonitorUp size={19} /><span>{sharing.active ? "Stop sharing" : "Share screen"}</span></button>
    </div>
    <div className="voice-dock__user"><span className="voice-dock__status">{!joined ? "Connecting…" : deafened ? "Deafened" : devices.audio_enabled ? "In voice" : "Mic muted"}</span>
      <button className={`icon-button ${!devices.audio_enabled ? "is-off" : ""}`} aria-label={devices.audio_enabled ? "Mute microphone" : "Unmute microphone"} data-tooltip={deafened ? "Undeafen to unmute" : devices.audio_enabled ? "Mute microphone" : "Unmute microphone"} aria-pressed={!devices.audio_enabled} disabled={pending || deafened || !joined} onClick={() => void setDevice({ audio_enabled: !devices.audio_enabled })}>{devices.audio_enabled ? <Mic size={19} /> : <MicOff size={19} />}</button>
      <button className={`icon-button ${deafened ? "is-off" : ""}`} aria-label={deafened ? "Undeafen" : "Deafen"} data-tooltip={deafened ? "Undeafen" : "Deafen"} aria-pressed={deafened} disabled={pending || !joined} onClick={() => void toggleDeafen()}>{deafened ? <HeadphoneOff size={19} /> : <Headphones size={19} />}</button>
    </div>
    {error && <p className="voice-dock__error" role="alert">{error}</p>}
  </section>, dock!)}<section className={`call-panel call-panel--${mode} ${!joined && !autoJoin ? "call-panel--preview" : ""} ${docked || (mode === "voice" && autoJoin) ? "call-panel--docked" : ""} ${docked && (!visible || minimized) ? "call-panel--away" : ""} ${joined && minimized && !docked ? "call-panel--minimized" : ""}`} aria-label={`${mode === "voice" ? "Voice channel" : "Group call"}: ${name}`}>
    <div className="call-panel__kind">{mode === "voice" ? "VOICE CHANNEL" : "GROUP CALL"}</div>
    <header>
      <div><strong>{name}</strong><small data-tooltip={connectionTooltip}>{!joined ? autoJoin ? "Connecting to voice…" : "Check your microphone and camera before joining" : mode === "voice" ? "Connected to voice" : "Group call connected"}{sharing.active ? sharing.audio ? " · Sharing screen and audio" : " · Sharing screen" : ""}</small></div>
      <CameraQualitySelect value={quality} onChange={changeQuality} disabled={loading || qualityPending} />
      {joined && <button className="icon-button" aria-label={minimized ? "Expand call" : "Minimize call"} onClick={() => setMinimized(!minimized)}>{minimized ? <Maximize2 /> : <Minimize2 />}</button>}
      <button className="call-hangup" disabled={leaving} onClick={leave} aria-label={joined ? "Leave call" : "Cancel call"}><PhoneOff size={18} /> {joined ? "Leave" : "Cancel"}</button>
      {search}
      {chat && onToggleChat && <VoiceChatToggle visible={chatVisible} unreadCount={chatUnreadCount} onToggle={onToggleChat} controls={`voice-chat-${roomId}`} />}
    </header>
    <div className="call-panel__body"><div className="call-panel__media">
    {loading && <p className="call-panel__loading" role="status">Loading call…</p>}
    {error && <p className="direct-call__error" role="alert">{error}</p>}
    <iframe ref={frame} title={`Element Call: ${name}`} allow="microphone; camera; autoplay; fullscreen; display-capture" sandbox="allow-scripts allow-same-origin allow-forms allow-popups" />
    </div>{chat && <div id={`voice-chat-${roomId}`} className="voice-chat-slot" hidden={!chatVisible}>{chat}</div>}</div>
  </section></>;
}
