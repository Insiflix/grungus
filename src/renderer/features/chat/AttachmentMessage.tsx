import { MediaAttachment } from "./MediaAttachment";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { Download, FileText } from "lucide-react";
import { attachmentMediaKind, formatFileSize, type MessageAttachment } from "../../../domain/messaging/Attachments";
import { AttachmentMediaContext } from "../../components/common/AttachmentMediaContext";
import type { MatrixUser } from "../../../domain/matrix/MatrixTypes";
import { ImageViewer } from "./ImageViewer";
import { ImageActionsMenu } from "./ImageActionsMenu";

type AttachmentProps = { attachment: MessageAttachment; inline: boolean; onLoad?: () => void; sender?: MatrixUser; timestamp?: number };
export function AttachmentMessage(props: AttachmentProps) {
  const kind = props.inline ? attachmentMediaKind(props.attachment) : null;
  if (kind === "video" || kind === "audio") return <MediaAttachment attachment={props.attachment} kind={kind} onLoad={props.onLoad} />;
  return <ImageOrFileAttachment {...props} />;
}
function ImageOrFileAttachment({ attachment, inline, onLoad, sender, timestamp }: AttachmentProps) {
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
  const original = useRef<{ key: string; blob: Blob } | null>(null);
  useEffect(() => {
    setSrc(null); setError(""); setViewing(false); setMenu(null);
    if (!image) return;
    const controller = new AbortController();
    let url: string | undefined;
    void (async () => {
      const blob = original.current?.key === attachmentKey ? original.current.blob : await load(attachment, controller.signal);
      controller.signal.throwIfAborted();
      original.current = { key: attachmentKey, blob };
      return blob;
    })().then(blob => {
      if (!controller.signal.aborted) { url = URL.createObjectURL(blob); setSrc(url); }
    }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Media could not be loaded."); });
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [attachmentKey, image, load, retry]);
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
  return <div className={`message-attachment ${image ? "message-attachment--image" : ""}`}>
    {image && (src ? <button type="button" className="message-attachment__image" aria-label={`View ${attachment.name}`} onClick={() => setViewing(true)} onContextMenu={event => { event.preventDefault(); event.stopPropagation(); setMenu({ x: event.clientX, y: event.clientY }); }}><img src={src} alt={attachment.name} onLoad={onLoad} onError={() => setError("Image could not be displayed.")} /></button> : !error && <div className="message-attachment__loading" role="status">Loading image…</div>)}
    {!image && <div className="message-attachment__details"><FileText size={22} /><span><strong>{attachment.name}</strong><small>{attachment.size !== undefined ? formatFileSize(attachment.size) : "Attachment"}</small></span><button type="button" className="icon-button" aria-label={`Download ${attachment.name}`} disabled={downloading} onClick={() => void download()}><Download size={18} /></button></div>}
    {error && <div className="message-attachment__error" role="alert">{error} {image && <button type="button" onClick={() => { original.current = null; setRetry(value => value + 1); }}>Retry</button>}</div>}
    {menu && <ImageActionsMenu position={menu} onClose={closeMenu} onView={() => setViewing(true)} onDownload={() => void download()} onCopyLink={copyLink} downloading={downloading} />}
    {viewing && src && <ImageViewer src={src} name={attachment.name} sender={sender} timestamp={timestamp} onClose={() => setViewing(false)} onDownload={() => void download()} onCopyLink={copyLink} downloading={downloading} error={error} />}
  </div>;
}
