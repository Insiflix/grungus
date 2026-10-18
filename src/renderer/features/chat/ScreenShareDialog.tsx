import { useEffect, useRef, useState } from "react";
import { Monitor, AppWindow, Volume2, X } from "lucide-react";
import type { ScreenShareRequest } from "../../../../electron/shared/session";
export function ScreenShareDialogHost() {
  const [request, setRequest] = useState<ScreenShareRequest | null>(null);
  useEffect(() => {
    const capture = window.desktop?.capture;
    if (!capture) return;
    const removeRequest = capture.onRequest(setRequest);
    const removeDismiss = capture.onDismiss(id => setRequest(current => current?.id === id ? null : current));
    return () => { removeRequest(); removeDismiss(); };
  }, []);
  return request && <ScreenShareDialog key={request.id} request={request} onClose={() => setRequest(null)} />;
}
function ScreenShareDialog({ request, onClose }: { request: ScreenShareRequest; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState<"screen" | "window">("screen");
  const [selected, setSelected] = useState<string | null>(null);
  const [audio, setAudio] = useState(request.audioRequested && request.systemAudioSupported);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const sources = request.sources.filter(source => source.kind === tab);
  useEffect(() => { dialog.current?.showModal(); return () => dialog.current?.close(); }, []);
  const respond = async (sourceId: string | null) => {
    setPending(true);
    try { await window.desktop?.capture.respond(request.id, sourceId, audio); onClose(); }
    catch { setError("Die Freigabe konnte nicht gestartet werden. Bitte erneut versuchen."); setPending(false); }
  };
  return <dialog ref={dialog} className="screen-picker" aria-labelledby="screen-picker-title" onCancel={event => { event.preventDefault(); void respond(null); }}>
    <header><div><h2 id="screen-picker-title">Bildschirm teilen</h2><p>Wähle aus, was die anderen sehen dürfen.</p></div><button className="icon-button" aria-label="Abbrechen" onClick={() => void respond(null)}><X /></button></header>
    <nav aria-label="Freigabequelle"><button aria-pressed={tab === "screen"} onClick={() => { setTab("screen"); setSelected(null); }}><Monitor /> Ganzer Bildschirm</button><button aria-pressed={tab === "window"} onClick={() => { setTab("window"); setSelected(null); }}><AppWindow /> Fenster</button></nav>
    <div className="screen-picker__sources">{sources.map(source => <button key={source.id} className={selected === source.id ? "is-selected" : ""} aria-pressed={selected === source.id} onClick={() => setSelected(source.id)}><img src={source.thumbnail} alt="" /><span>{source.icon && <img src={source.icon} alt="" />}{source.name}</span></button>)}{!sources.length && <p>Keine verfügbaren Quellen. Wähle den anderen Tab.</p>}</div>
    <label className="screen-picker__audio"><Volume2 size={20} /><input type="checkbox" checked={audio} disabled={!request.systemAudioSupported || !request.audioRequested} onChange={event => setAudio(event.target.checked)} /><span>Gesamten Computerton teilen<small>{!request.audioRequested ? "Diese Gegenstelle unterstützt die Übertragung von Systemaudio nicht." : request.systemAudioSupported ? "Erfasst alle Programme – auch wenn du nur ein Fenster teilst." : "Systemaudio wird auf dieser Plattform nicht unterstützt. Die Freigabe erfolgt ohne Ton."}</small></span></label>
    {error && <p role="alert">{error}</p>}
    <footer><button onClick={() => void respond(null)} disabled={pending}>Abbrechen</button><button className="primary-button" onClick={() => void respond(selected)} disabled={!selected || pending}>Jetzt teilen</button></footer>
  </dialog>;
}
