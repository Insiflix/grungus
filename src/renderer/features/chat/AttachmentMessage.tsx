import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { Download, FileText, Play } from "lucide-react";
import { attachmentMediaKind, attachmentMimeType, formatFileSize, type MessageAttachment } from "../../../domain/messaging/Attachments";
import { AttachmentMediaContext } from "../../components/common/AttachmentMediaContext";
import type { MatrixUser } from "../../../domain/matrix/MatrixTypes";
import { ImageViewer } from "./ImageViewer";
import { ImageActionsMenu } from "./ImageActionsMenu";
import { canConvertPlayback, convertPlayback, preparePlayback } from "./MediaPlayback";

export function AttachmentMessage({ attachment, inline, onLoad, sender, timestamp }: { attachment: MessageAttachment; inline: boolean; onLoad?: () => void; sender?: MatrixUser; timestamp?: number }) {
  const load = useContext(AttachmentMediaContext);
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [retry, setRetry] = useState(0);
  const [viewing, setViewing] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const attachmentKey = JSON.stringify(attachment);
  const kind = inline ? attachmentMediaKind(attachment) : null;
  const image = kind === "image";
  const playable = kind === "video" || kind === "audio";
  const [requestedKey, setRequestedKey] = useState<string | null>(null);
  const [conversionKey, setConversionKey] = useState<string | null>(null);
  const requested = requestedKey === attachmentKey;
  const original = useRef<{ key: string; blob: Blob } | null>(null);
  const converted = useRef(false);
  useEffect(() => {
    setSrc(null); setError(""); setViewing(false); setMenu(null);
    if (!image && !(playable && requested)) return;
    const controller = new AbortController();
    let url: string | undefined;
    void (async () => {
      const blob = original.current?.key === attachmentKey ? original.current.blob : await load(attachment, controller.signal);
      controller.signal.throwIfAborted();
      original.current = { key: attachmentKey, blob };
      let prepared = blob;
      converted.current = false;
      if (kind === "video" || kind === "audio") {
        converted.current = conversionKey === attachmentKey || (!document.createElement(kind).canPlayType(attachmentMimeType(attachment.name, attachment.mimeType)) && canConvertPlayback());
        prepared = conversionKey === attachmentKey ? await convertPlayback(blob, kind, controller.signal) : await preparePlayback(blob, attachment, kind, controller.signal);
      }
      return prepared;
    })().then(blob => {
      if (!controller.signal.aborted) { url = URL.createObjectURL(blob); setSrc(url); }
    }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Media could not be loaded."); });
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [attachmentKey, kind, playable, requested, conversionKey, load, retry]);
  const download = async () => {
    if (downloading) return;
    setDownloading(true); setError("");
    let url: string | undefined;
    try {
      url = image && src ? src : URL.createObjectURL(original.current?.key === attachmentKey ? original.current.blob : await load(attachment));
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = attachment.name; anchor.click();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Download failed."); }
    finally { if (url && url !== src) setTimeout(() => URL.revokeObjectURL(url!), 1000); setDownloading(false); }
  };
  const copyLink = async () => {
    try {
      if (window.desktop?.clipboard) await window.desktop.clipboard.writeText(attachment.url);
      else await navigator.clipboard.writeText(attachment.url);
    } catch { setError("Image link could not be copied."); }
  };
  const playbackError = () => {
    if (canConvertPlayback() && !converted.current) setConversionKey(attachmentKey);
    else setError("This file could not be played. Download the original to play it externally.");
  };
  return <div className={`message-attachment ${image ? "message-attachment--image" : playable ? `message-attachment--${kind}` : ""}`}>
    {image && (src ? <button type="button" className="message-attachment__image" aria-label={`View ${attachment.name}`} onClick={() => setViewing(true)} onContextMenu={event => { event.preventDefault(); event.stopPropagation(); setMenu({ x: event.clientX, y: event.clientY }); }}><img src={src} alt={attachment.name} onLoad={onLoad} onError={() => setError("Image could not be displayed.")} /></button> : !error && <div className="message-attachment__loading" role="status">Loading image…</div>)}
    {playable && (src ? kind === "video" ? <video aria-label={`Play ${attachment.name}`} src={src} controls playsInline autoPlay={requested} preload="metadata" onLoadedMetadata={onLoad} onError={playbackError} /> : <audio aria-label={`Play ${attachment.name}`} src={src} controls autoPlay={requested} preload="metadata" onLoadedMetadata={onLoad} onError={playbackError} /> : !error && (requested ? <div className="message-attachment__loading" role="status">Preparing {kind}…</div> : <button type="button" className="media-play-button" onClick={() => setRequestedKey(attachmentKey)}><Play size={24} /> Play {kind}</button>))}
    {!image && <div className="message-attachment__details"><FileText size={22} /><span><strong>{attachment.name}</strong><small>{attachment.size !== undefined ? formatFileSize(attachment.size) : "Attachment"}</small></span><button type="button" className="icon-button" aria-label={`Download ${attachment.name}`} disabled={downloading} onClick={() => void download()}><Download size={18} /></button></div>}
    {error && <div className="message-attachment__error" role="alert">{error} {(image || playable) && <button type="button" onClick={() => { original.current = null; setRetry(value => value + 1); }}>Retry</button>}</div>}
    {menu && <ImageActionsMenu position={menu} onClose={closeMenu} onView={() => setViewing(true)} onDownload={() => void download()} onCopyLink={copyLink} downloading={downloading} />}
    {viewing && src && <ImageViewer src={src} name={attachment.name} sender={sender} timestamp={timestamp} onClose={() => setViewing(false)} onDownload={() => void download()} onCopyLink={copyLink} downloading={downloading} error={error} />}
  </div>;
}
