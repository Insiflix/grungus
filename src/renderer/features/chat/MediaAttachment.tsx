import "./MediaAttachment.css";
import { useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { Download, Film, Headphones, Maximize, Minimize, Music2, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { attachmentMimeType, formatFileSize, type MessageAttachment } from "../../../domain/messaging/Attachments";
import { AttachmentMediaContext } from "../../components/common/AttachmentMediaContext";
import { readMediaMetadata } from "../../../infrastructure/matrix/MediaMetadata";
import { canConvertPlayback, convertPlayback, preparePlayback } from "./MediaPlayback";

export function mediaTime(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  return safe >= 3600 ? `${Math.floor(safe / 3600)}:${String(Math.floor(safe / 60) % 60).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}` : `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

export function MediaAttachment({ attachment, kind, onLoad }: { attachment: MessageAttachment; kind: "video" | "audio"; onLoad?: () => void }) {
  const load = useContext(AttachmentMediaContext);
  const key = JSON.stringify(attachment);
  const instance = useId();
  const root = useRef<HTMLDivElement>(null);
  const media = useRef<HTMLMediaElement | null>(null);
  const intent = useRef(false);
  const converted = useRef(false);
  const [visible, setVisible] = useState(false);
  const [requestedKey, setRequestedKey] = useState<string | null>(null);
  const [conversionKey, setConversionKey] = useState<string | null>(null);
  const [source, setSource] = useState<{ key: string; url: string } | null>(null);
  const [poster, setPoster] = useState<{ key: string; url: string } | null>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState((attachment.durationMs ?? 0) / 1000);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [error, setError] = useState("");
  const [previewRequest, setPreviewRequest] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewUnavailable, setPreviewUnavailable] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [retry, setRetry] = useState(0);
  const requested = requestedKey === key;
  const src = source?.key === key ? source.url : undefined;
  const preview = poster?.key === key ? poster.url : undefined;
  const preparing = requested && !src && !error;
  const resource = useMemo(() => {
    let controller = new AbortController();
    let pending: Promise<Blob> | undefined;
    return { get controller() { return controller; }, get: () => {
      if (controller.signal.aborted) { controller = new AbortController(); pending = undefined; }
      return pending ??= load(attachment, controller.signal).catch(cause => { pending = undefined; throw cause; });
    } };
  }, [load, key, retry]);
  useEffect(() => () => resource.controller.abort(), [resource]);
  useEffect(() => {
    if (kind !== "video" || !root.current) return;
    if (typeof IntersectionObserver === "undefined") { setVisible(true); return; }
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); } }, { rootMargin: "80px" });
    observer.observe(root.current); return () => observer.disconnect();
  }, [kind, key]);
  useEffect(() => {
    if (kind !== "video" || !visible) return;
    const controller = new AbortController();
    let url: string | undefined;
    const canPreview = Boolean(attachment.thumbnail) || previewRequest === key || (typeof attachment.size === "number" && attachment.size <= 16 * 1024 * 1024);
    if (!canPreview) return;
    setPreviewLoading(true); setPreviewUnavailable(false);
    // Delay previews until the chat switch is painted. Never transcode for a preview.
    const timer = setTimeout(() => {
      void (async () => {
        let blob: Blob | undefined;
        if (attachment.thumbnail) blob = await load({ ...attachment.thumbnail, name: `${attachment.name} preview` }, controller.signal);
        else if (previewRequest === key || (typeof attachment.size === "number" && attachment.size <= 16 * 1024 * 1024)) {
          const original = await resource.get(); controller.signal.throwIfAborted();
          const typed = original.slice(0, original.size, attachmentMimeType(attachment.name, attachment.mimeType));
          blob = (await readMediaMetadata(typed, "video", controller.signal)).poster;
        }
        controller.signal.throwIfAborted();
        if (blob) { url = URL.createObjectURL(blob); setPoster({ key, url }); } else setPreviewUnavailable(true);
      })().catch(() => { if (!controller.signal.aborted) setPreviewUnavailable(true); }).finally(() => { if (!controller.signal.aborted) setPreviewLoading(false); });
    }, 180);
    return () => { clearTimeout(timer); controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [kind, visible, key, load, resource, previewRequest]);
  useEffect(() => {
    setSource(null); setError(""); setPlaying(false); setPosition(0); setDuration((attachment.durationMs ?? 0) / 1000);
    if (!requested) return;
    const controller = new AbortController();
    let url: string | undefined;
    void (async () => {
      const blob = await resource.get(); controller.signal.throwIfAborted();
      converted.current = conversionKey === key || (!document.createElement(kind).canPlayType(attachmentMimeType(attachment.name, attachment.mimeType)) && canConvertPlayback());
      return conversionKey === key ? convertPlayback(blob, kind, controller.signal) : preparePlayback(blob, attachment, kind, controller.signal);
    })().then(blob => {
      if (controller.signal.aborted) return;
      url = URL.createObjectURL(blob); setSource({ key, url });
    }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Media could not be loaded."); });
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [key, kind, requested, conversionKey, resource]);
  const play = () => {
    const element = media.current;
    if (!element) return;
    if (element.ended) element.currentTime = 0;
    void element.play().catch(cause => {
      setPlaying(false);
      if (cause?.name !== "NotAllowedError" && cause?.name !== "AbortError") setError("Playback could not start. Try again or download the original.");
    });
  };
  useEffect(() => { if (src && intent.current) play(); }, [src]);
  useEffect(() => {
    const element = media.current;
    if (element) { element.volume = volume; element.muted = muted; element.playbackRate = speed; }
  }, [src, volume, muted, speed]);
  useEffect(() => {
    const otherPlayed = (event: Event) => { if ((event as CustomEvent).detail !== instance) media.current?.pause(); };
    const changed = () => setFullscreen(document.fullscreenElement === root.current);
    window.addEventListener("grungus:media-play", otherPlayed); document.addEventListener("fullscreenchange", changed);
    return () => { window.removeEventListener("grungus:media-play", otherPlayed); document.removeEventListener("fullscreenchange", changed); };
  }, [instance]);
  const toggle = () => {
    if (preparing) return;
    if (!src) { intent.current = true; setError(""); setRequestedKey(key); return; }
    if (media.current?.paused) play(); else media.current?.pause();
  };
  const seek = (value: number) => { if (media.current && Number.isFinite(value)) { media.current.currentTime = Math.max(0, Math.min(duration, value)); setPosition(media.current.currentTime); } };
  const expand = () => {
    void (document.fullscreenElement === root.current ? document.exitFullscreen() : root.current?.requestFullscreen())?.catch(() => setError("Fullscreen is unavailable."));
  };
  const download = async () => {
    if (downloading) return;
    setDownloading(true); setDownloadError("");
    try {
      const blob = await resource.get(); resource.controller.signal.throwIfAborted();
      const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = attachment.name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) { if (!resource.controller.signal.aborted) setDownloadError(cause instanceof Error ? cause.message : "Download failed."); }
    finally { setDownloading(false); }
  };
  const metadata = () => {
    const element = media.current;
    if (element && Number.isFinite(element.duration)) setDuration(element.duration);
    onLoad?.();
  };
  const failed = () => {
    if (canConvertPlayback() && !converted.current) setConversionKey(key);
    else setError("This file could not be played. Download the original to play it externally.");
  };
  const events = {
    onPlay: () => { setPlaying(true); window.dispatchEvent(new CustomEvent("grungus:media-play", { detail: instance })); },
    onPause: () => setPlaying(false), onEnded: () => setPlaying(false),
    onTimeUpdate: () => setPosition(media.current?.currentTime ?? 0),
    onLoadedMetadata: metadata, onDurationChange: metadata, onError: failed,
    onVolumeChange: () => { if (media.current) { setVolume(media.current.volume); setMuted(media.current.muted); } },
  };
  const totalTime = duration > 0 ? mediaTime(duration) : "--:--";
  const percent = duration ? Math.min(100, position / duration * 100) : 0;
  const progress = <div className="media-player__timeline">
    {kind === "audio" && attachment.waveform && attachment.waveform.length > 0 && <div className="media-player__waveform" aria-hidden="true">{attachment.waveform.filter((_, index) => index % Math.max(1, Math.ceil(attachment.waveform!.length / 56)) === 0).map((value, index, values) => <i key={index} className={index / values.length * 100 <= percent ? "is-played" : ""} style={{ height: `${Math.max(8, value / 1024 * 100)}%` }} />)}</div>}
    <input type="range" min={0} max={duration || 1} step={.1} value={Math.min(position, duration || 1)} disabled={!src || duration <= 0} aria-label={`Seek ${attachment.name}`} aria-valuetext={`${mediaTime(position)} of ${totalTime}`} style={{ background: `linear-gradient(to right, var(--accent) ${percent}%, var(--media-track) ${percent}%)` }} onChange={event => seek(Number(event.target.value))} />
  </div>;
  const volumeControls = <div className="media-player__volume"><button type="button" aria-label={`${muted || volume === 0 ? "Unmute" : "Mute"} ${attachment.name}`} onClick={() => setMuted(value => !value)}>{muted || volume === 0 ? <VolumeX size={17} /> : <Volume2 size={17} />}</button><input type="range" min={0} max={1} step={.05} value={muted ? 0 : volume} aria-label={`Volume ${attachment.name}`} onChange={event => { setVolume(Number(event.target.value)); setMuted(false); }} /></div>;
  const downloadButton = <button type="button" aria-label={`Download ${attachment.name}`} disabled={downloading} onClick={() => void download()}><Download size={17} /></button>;
  return <div ref={root} className={`media-player media-player--${kind} ${playing ? "is-playing" : ""}`} role="group" aria-label={`${attachment.voice ? "Voice message" : kind === "video" ? "Video" : "Audio"}: ${attachment.name}`}>
    {kind === "video" ? <>
      <div className="media-player__video-stage" tabIndex={0} aria-label={`Video playback: ${attachment.name}`} style={{ aspectRatio: attachment.width && attachment.height ? `${attachment.width} / ${attachment.height}` : "16 / 9" }} onKeyDown={event => {
        if (event.target !== event.currentTarget) return;
        if (event.key === " " || event.key.toLowerCase() === "k") { event.preventDefault(); toggle(); }
        if (event.key === "ArrowRight" || event.key === "ArrowLeft") { event.preventDefault(); seek(position + (event.key === "ArrowRight" ? 5 : -5)); }
        if (event.key.toLowerCase() === "m") setMuted(value => !value);
        if (event.key.toLowerCase() === "f") expand();
      }}>
        {src ? <video ref={element => { media.current = element; }} src={src} poster={preview} aria-label={attachment.name} playsInline preload="metadata" {...events} onClick={toggle} /> : preview ? <img className="media-player__poster" src={preview} alt={`Preview of ${attachment.name}`} onError={() => setPoster(null)} /> : <div className="media-player__video-placeholder" aria-hidden="true"><Film size={36} /></div>}
        <div className="media-player__video-title"><strong>{attachment.name}</strong>{downloadButton}</div>
        {!playing && <button type="button" className="media-play-button media-player__big-play" aria-label="Play video" disabled={preparing} onClick={toggle}><Play size={28} fill="currentColor" />{preparing && <span>Preparing...</span>}</button>}
        {!src && !preview && <div className="media-player__preview-action">{previewLoading ? <span>Loading preview...</span> : previewUnavailable ? <span>Preview unavailable</span> : <button type="button" onClick={() => setPreviewRequest(key)}>Load preview</button>}</div>}
        {!src && duration > 0 && <span className="media-player__duration">{mediaTime(duration)}</span>}
      </div>
      <div className="media-player__video-controls"><button type="button" aria-label={`${playing ? "Pause" : "Play"} ${attachment.name}`} disabled={preparing} onClick={toggle}>{playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}</button>{progress}<span className="media-player__time">{mediaTime(position)} / {totalTime}</span>{volumeControls}<button type="button" aria-label={fullscreen ? "Exit fullscreen" : `Fullscreen ${attachment.name}`} onClick={expand}>{fullscreen ? <Minimize size={17} /> : <Maximize size={17} />}</button></div>
    </> : <>
      {src && <audio ref={element => { media.current = element; }} src={src} preload="metadata" aria-label={attachment.name} {...events} />}
      <div className="media-player__audio-top"><span className="media-player__audio-icon" aria-hidden="true">{attachment.voice ? <Headphones size={21} /> : <Music2 size={21} />}</span><span className="media-player__audio-name"><strong>{attachment.name}</strong><small>{attachment.voice ? "Voice message" : "Audio"}{attachment.size !== undefined ? ` · ${formatFileSize(attachment.size)}` : ""}</small></span>{downloadButton}</div>
      <div className="media-player__audio-main"><button type="button" className="media-play-button media-player__audio-play" aria-label={`${playing ? "Pause" : "Play"} audio`} disabled={preparing} onClick={toggle}>{playing ? <Pause size={21} fill="currentColor" /> : <Play size={21} fill="currentColor" />}</button><div className="media-player__audio-progress">{progress}<div className="media-player__audio-meta"><span>{preparing ? "Preparing audio..." : `${mediaTime(position)} / ${totalTime}`}</span><button type="button" className="media-player__speed" aria-label={`Playback speed ${speed}x`} onClick={() => setSpeed(value => ({ 1: 1.25, 1.25: 1.5, 1.5: 2, 2: 1 }[value] ?? 1))}>{speed}×</button>{volumeControls}</div></div></div>
    </>}
    {downloadError && <div className="media-player__error" role="alert">{downloadError}<button type="button" disabled={downloading} onClick={() => void download()}>Retry download</button></div>}
    {error && <div className="media-player__error" role="alert">{error}<button type="button" onClick={() => { setError(""); intent.current = true; setRequestedKey(key); setRetry(value => value + 1); }}>Retry</button></div>}
  </div>;
}
