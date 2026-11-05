import { useEffect, useRef, useState } from "react";
import { MonitorPlay, Video } from "lucide-react";
import { ThemedPopover } from "../../components/common/ThemedPopover";
import { voiceActivity } from "../../../domain/calls/VoiceActivity";

export interface AvailableVoiceMedia { userId: string; name: string; source: "screen_share" | "camera" }
export function StreamLiveBadge({ roomId, streams, camera = false }: { roomId: string; streams: AvailableVoiceMedia[]; camera?: boolean }) {
  const anchor = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const restoringFocus = useRef(false);
  const dismiss = () => {
    clearTimeout(timer.current); setOpen(false); restoringFocus.current = true;
    queueMicrotask(() => { restoringFocus.current = false; });
  };
  const show = () => { clearTimeout(timer.current); setOpen(true); };
  const hide = () => { clearTimeout(timer.current); timer.current = setTimeout(() => setOpen(false), 150); };
  useEffect(() => () => clearTimeout(timer.current), []);
  if (!streams.length) return null;
  const stream = streams.find(item => `${item.userId}:${item.source}` === selected) ?? streams[0];
  return <span className="voice-live" onPointerEnter={show} onPointerLeave={hide} onFocus={() => { if (!restoringFocus.current) show(); }} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) hide(); }}>
    <button ref={anchor} type="button" className={`voice-live-trigger ${camera ? "voice-live-trigger--camera" : ""}`} aria-label={`${camera ? "Camera" : "Live stream"} from ${[...new Set(streams.map(stream => stream.name))].join(", ")}`} aria-expanded={open} aria-haspopup="dialog" onClick={event => { event.stopPropagation(); show(); }}>{camera ? <Video size={13} /> : "LIVE"}</button>
    {open && <ThemedPopover anchor={anchor} onClose={dismiss} className="stream-hover-card" role="dialog" label="Available streams" width={300} side="right">
      {streams.length > 1 && <div className="stream-hover-card__tabs" role="tablist" aria-label="Choose video">{streams.map(item => <button type="button" role="tab" key={`${item.userId}:${item.source}`} aria-selected={item === stream} aria-label={`${item.name}: ${item.source === "camera" ? "Camera" : "Stream"}`} onClick={() => setSelected(`${item.userId}:${item.source}`)}><span>{item.name}</span><small>{item.source === "camera" ? "Camera" : "Stream"}</small></button>)}</div>}
      <section className="stream-hover-card__stream">
        <header><span>{stream.source === "camera" ? "Camera on" : "Streaming now"}</span><b>{stream.source === "camera" ? "CAMERA" : "LIVE"}</b></header>
        <div className="stream-hover-card__preview">{stream.source === "camera" ? <Video size={26} /> : <MonitorPlay size={26} />}<strong>{stream.name}</strong><small>{stream.source === "camera" ? "Open camera to watch" : "Join the stream to watch"}</small></div>
        <button type="button" className="stream-hover-card__watch" onClick={event => { event.stopPropagation(); voiceActivity.watch({ roomId, userId: stream.userId, source: stream.source }); setOpen(false); }}>{stream.source === "camera" ? "Watch camera" : "Watch stream"}</button>
      </section>
    </ThemedPopover>}
  </span>;
}
