import { CameraQualitySelect } from "./CameraQualitySelect";
import { MonitorUp, MonitorOff } from "lucide-react";
﻿import { useEffect, useState } from "react";
import { Mic, MicOff, Video, VideoOff, Phone, PhoneOff, X } from "lucide-react";
import type { DirectCallFeed, DirectCallState } from "../../../domain/calls/DirectCall";
import { directCalls } from "../../app/providers/MatrixProvider";
import { usePreferences } from "../../hooks/usePreferences";
const states: Record<string, string> = { fledgling: "Preparing call", wait_local_media: "Waiting for microphone / camera", create_offer: "Preparing call", invite_sent: "Ringing …", ringing: "Incoming call", create_answer: "Answering call", connecting: "Connecting …", connected: "Connected", ended: "Call ended" };
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
  return <div className={feed.local && !feed.screenshare ? "direct-call__local" : "direct-call__remote"}><video ref={setNode} autoPlay playsInline muted={feed.local} />{outputError && <p role="alert">Selected speaker unavailable. Choose another speaker in settings.</p>}{blocked && <button onClick={() => { void node?.play().then(() => setBlocked(false)); }}>Play audio / video</button>}</div>;
}
export function DirectCallPanel({ call, canAnswer = true }: { call: DirectCallState; canAnswer?: boolean }) {
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const run = async (action: () => Promise<void>) => { setPending(true); setActionError(null); try { await action(); } catch(error) { setActionError(error instanceof Error ? error.message : "Action failed"); } finally { setPending(false); } };
  const ringing = call.incoming && call.state === "ringing";
  const ended = call.state === "ended";
  return <section className={`call-panel direct-call ${ringing ? "direct-call--ringing" : ""}`} aria-label={`Call: ${call.name}`}>
    <header><div><strong>{call.name}</strong><small>{states[call.state] ?? call.state} · Classic Matrix call</small></div><CameraQualitySelect value={call.cameraQuality} disabled={pending || ended} onChange={quality => void run(() => directCalls.setCameraQuality(quality))} />{ended && <button className="icon-button" aria-label="Close call" onClick={directCalls.close}><X /></button>}</header>
    {(call.error || actionError) && <p className="direct-call__error" role="alert">{actionError ?? call.error}</p>}
    <div className="direct-call__stage">{call.feeds.map(feed => <Feed key={feed.id} feed={feed} />)}{!call.feeds.length && <div className="direct-call__placeholder"><Phone size={48} /><p>{states[call.state] ?? call.state}</p></div>}</div>
    {call.screenSharing && <p className="share-status" role="status">{call.screenAudio ? "Sharing screen and all computer audio" : "Sharing screen without system audio"}</p>}
    <footer>{ringing ? <><button className="direct-call__answer" disabled={pending || !canAnswer} onClick={() => void run(directCalls.answer)}><Phone /> Accept</button><button className="call-hangup" onClick={directCalls.reject}><PhoneOff /> Decline</button>{!canAnswer && <span>Leave the current call first.</span>}</> : ended ? <button onClick={directCalls.close}>Close</button> : <><button className="icon-button" disabled={pending} aria-label={call.microphoneMuted ? "Unmute microphone" : "Mute microphone"} onClick={() => void run(directCalls.toggleMicrophone)}>{call.microphoneMuted ? <MicOff /> : <Mic />}</button>{call.video && <button className="icon-button" disabled={pending} aria-label={call.cameraMuted ? "Turn camera on" : "Turn camera off"} onClick={() => void run(directCalls.toggleCamera)}>{call.cameraMuted ? <VideoOff /> : <Video />}</button>}<button className="icon-button" disabled={pending || call.state !== "connected"} aria-label={call.screenSharing ? "Stop screen sharing" : "Share screen"} data-tooltip={call.screenSharing ? "Stop sharing" : "Share screen"} onClick={() => void run(directCalls.toggleScreenshare)}>{call.screenSharing ? <MonitorOff /> : <MonitorUp />}</button><button className="call-hangup" onClick={directCalls.hangup}><PhoneOff /> Hang up</button></>}</footer>
  </section>;
}
