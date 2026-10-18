import type { ICallProvider, CallHandle } from "../../../domain/calls/ICallProvider";
import { CameraQualitySelect } from "./CameraQualitySelect";
import { isCameraQuality, loadCameraQuality, saveCameraQuality, type CameraQuality } from "../../../domain/calls/CameraQuality";
import { useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2, PhoneOff } from "lucide-react";
import { mountCall } from "../../app/providers/MatrixProvider";
export function CallPanel({ roomId, name, video, onClose, mount = mountCall }: { roomId: string; name: string; video: boolean; onClose: () => void; mount?: ICallProvider["mountCall"] }) {
  const callHandle = useRef<CallHandle | null>(null);
  const [quality, setQuality] = useState(loadCameraQuality);
  const [qualityPending, setQualityPending] = useState(false);
  const qualityTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [sharing, setSharing] = useState<{ active: boolean; audio: boolean }>({ active: false, audio: false });
  const [leaving, setLeaving] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const [joined, setJoined] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!frame.current) return;
    const timeout = setTimeout(() => { setLoading(false); setError("Element Call antwortet nicht. Bitte erneut öffnen; Details stehen in der Entwicklerkonsole."); }, 20000);
    try {
      const handle = mount(frame.current, roomId, video, onClose, () => { clearTimeout(timeout); setLoading(false); }, () => setJoined(true));
      callHandle.current = handle;
      return () => { clearTimeout(timeout); handle.dispose(); callHandle.current = null; };
    }
    catch (error) { clearTimeout(timeout); setLoading(false); setError(error instanceof Error ? error.message : "Anruf konnte nicht gestartet werden"); }
  }, [roomId, video, onClose, mount]);
  useEffect(() => {
    const listener = (event: MessageEvent) => {
      const data = event.data;
      const widgetId = frame.current ? new URLSearchParams(new URL(frame.current.src).hash.slice(2)).get("widgetId") : null;
      if (event.source !== frame.current?.contentWindow || event.origin !== location.origin || data?.type !== "grungus:media-status" || data.widgetId !== widgetId) return;
      if (isCameraQuality(data.quality)) { clearTimeout(qualityTimeout.current); setQualityPending(false); setQuality(data.quality); if (!data.qualityError) saveCameraQuality(data.quality); setError(data.qualityError ?? null); }
      if (typeof data.sharing === "boolean") setSharing({ active: data.sharing, audio: Boolean(data.systemAudio) });
    };
    window.addEventListener("message", listener);
    return () => { window.removeEventListener("message", listener); clearTimeout(qualityTimeout.current); };
  }, []);
  const changeQuality = (next: CameraQuality) => {
    if (!frame.current) return;
    setQualityPending(true);
    const widgetId = new URLSearchParams(new URL(frame.current.src).hash.slice(2)).get("widgetId");
    frame.current.contentWindow?.postMessage({ type: "grungus:camera-quality", quality: next, widgetId }, location.origin);
    clearTimeout(qualityTimeout.current);
    qualityTimeout.current = setTimeout(() => { setQualityPending(false); setError("Kamera-Einstellung konnte nicht angewendet werden."); }, 5000);
  };
  return <section className={`call-panel ${!joined ? "call-panel--preview" : ""} ${joined && minimized ? "call-panel--minimized" : ""}`} aria-label={`Anruf in ${name}`}>
    <header><div><strong>{name}</strong><small>{!joined ? "Mikrofon und Kamera vor dem Beitreten prüfen" : "MatrixRTC · Element Call"}{sharing.active ? sharing.audio ? " | Bildschirm + Systemaudio" : " | Bildschirm ohne Ton" : ""}</small></div><CameraQualitySelect value={quality} onChange={changeQuality} disabled={loading || qualityPending} />{joined && <button className="icon-button" aria-label={minimized ? "Anruf vergrößern" : "Anruf minimieren"} onClick={() => setMinimized(!minimized)}>{minimized ? <Maximize2 /> : <Minimize2 />}</button>}<button className="call-hangup" disabled={leaving} onClick={() => { setLeaving(true); if (callHandle.current) void callHandle.current.hangup(); else onClose(); }} aria-label={joined ? "Anruf verlassen" : "Anruf abbrechen"}><PhoneOff size={18} /> {joined ? "Verlassen" : "Abbrechen"}</button></header>
    {loading && <p className="call-panel__loading" role="status">Element Call wird geladen …</p>}
    {error && <p className="direct-call__error" role="alert">{error}</p>}
    <iframe ref={frame} title={`Element Call: ${name}`} allow="microphone; camera; autoplay; fullscreen; display-capture" sandbox="allow-scripts allow-same-origin allow-forms allow-popups" />
  </section>;
}
