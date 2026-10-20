import { CameraQualitySelect } from "./CameraQualitySelect";
import { MonitorUp, MonitorOff } from "lucide-react";
﻿import { useEffect, useState } from "react";
import { Mic, MicOff, Video, VideoOff, Phone, PhoneOff, X } from "lucide-react";
import type { DirectCallFeed, DirectCallState } from "../../../domain/calls/DirectCall";
import { directCalls } from "../../app/providers/MatrixProvider";
import { usePreferences } from "../../hooks/usePreferences";
const states: Record<string, string> = { fledgling: "Anruf wird vorbereitet", wait_local_media: "Warte auf Mikrofon / Kamera", create_offer: "Anruf wird vorbereitet", invite_sent: "Es klingelt …", ringing: "Eingehender Anruf", create_answer: "Anruf wird angenommen", connecting: "Verbindung wird aufgebaut …", connected: "Verbunden", ended: "Anruf beendet" };
function Feed({ feed }: { feed: DirectCallFeed }) {
  const prefs = usePreferences();
  const [outputError, setOutputError] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [node, setNode] = useState<HTMLVideoElement | null>(null);
  useEffect(() => {
    if (node && !feed.local && typeof node.setSinkId === "function") void node.setSinkId(prefs.audioOutput).then(() => setOutputError(false)).catch(() => setOutputError(true));
  }, [node, feed.local, prefs.audioOutput]);
  useEffect(() => {
    if (!node) return;
    node.srcObject = feed.stream;
    void node.play().catch(() => setBlocked(true));
    return () => { node.srcObject = null; };
  }, [node, feed.stream]);
  return <div className={feed.local && !feed.screenshare ? "direct-call__local" : "direct-call__remote"}><video ref={setNode} autoPlay playsInline muted={feed.local} />{outputError && <p role="alert">Selected speaker unavailable. Choose another speaker in settings.</p>}{blocked && <button onClick={() => { void node?.play().then(() => setBlocked(false)); }}>Audio / Video wiedergeben</button>}</div>;
}
export function DirectCallPanel({ call, canAnswer = true }: { call: DirectCallState; canAnswer?: boolean }) {
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const run = async (action: () => Promise<void>) => { setPending(true); setActionError(null); try { await action(); } catch(error) { setActionError(error instanceof Error ? error.message : "Aktion fehlgeschlagen"); } finally { setPending(false); } };
  const ringing = call.incoming && call.state === "ringing";
  const ended = call.state === "ended";
  return <section className={`call-panel direct-call ${ringing ? "direct-call--ringing" : ""}`} aria-label={`Anruf: ${call.name}`}>
    <header><div><strong>{call.name}</strong><small>{states[call.state] ?? call.state} · Klassischer Matrix-Anruf</small></div><CameraQualitySelect value={call.cameraQuality} disabled={pending || ended} onChange={quality => void run(() => directCalls.setCameraQuality(quality))} />{ended && <button className="icon-button" aria-label="Anruf schließen" onClick={directCalls.close}><X /></button>}</header>
    {(call.error || actionError) && <p className="direct-call__error" role="alert">{actionError ?? call.error}</p>}
    <div className="direct-call__stage">{call.feeds.map(feed => <Feed key={feed.id} feed={feed} />)}{!call.feeds.length && <div className="direct-call__placeholder"><Phone size={48} /><p>{states[call.state] ?? call.state}</p></div>}</div>
    {call.screenSharing && <p className="share-status" role="status">{call.screenAudio ? "Bildschirm + gesamter Computerton werden geteilt" : "Bildschirm wird ohne Systemaudio geteilt"}</p>}
    <footer>{ringing ? <><button className="direct-call__answer" disabled={pending || !canAnswer} onClick={() => void run(directCalls.answer)}><Phone /> Annehmen</button><button className="call-hangup" onClick={directCalls.reject}><PhoneOff /> Ablehnen</button>{!canAnswer && <span>Verlasse zuerst den laufenden Anruf.</span>}</> : ended ? <button onClick={directCalls.close}>Schließen</button> : <><button className="icon-button" disabled={pending} aria-label={call.microphoneMuted ? "Mikrofon aktivieren" : "Mikrofon stummschalten"} onClick={() => void run(directCalls.toggleMicrophone)}>{call.microphoneMuted ? <MicOff /> : <Mic />}</button>{call.video && <button className="icon-button" disabled={pending} aria-label={call.cameraMuted ? "Kamera aktivieren" : "Kamera ausschalten"} onClick={() => void run(directCalls.toggleCamera)}>{call.cameraMuted ? <VideoOff /> : <Video />}</button>}<button className="icon-button" disabled={pending || call.state !== "connected"} aria-label={call.screenSharing ? "Bildschirmfreigabe beenden" : "Bildschirm teilen"} data-tooltip={call.screenSharing ? "Freigabe beenden" : "Bildschirm teilen"} onClick={() => void run(directCalls.toggleScreenshare)}>{call.screenSharing ? <MonitorOff /> : <MonitorUp />}</button><button className="call-hangup" onClick={directCalls.hangup}><PhoneOff /> Auflegen</button></>}</footer>
  </section>;
}
