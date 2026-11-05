import { copyImage } from "./copyImage";
import { MediaAttachment } from "./MediaAttachment";
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Download, FileText } from "lucide-react";
import { attachmentMediaKind, formatFileSize, type MessageAttachment } from "../../../domain/messaging/Attachments";
import { AttachmentMediaContext } from "../../components/common/AttachmentMediaContext";
import type { MatrixUser } from "../../../domain/matrix/MatrixTypes";
import { ImageViewer } from "./ImageViewer";
import { ImageActionsMenu } from "./ImageActionsMenu";

// Missing dimensions in older messages use a stable fallback on first display.
// Remember decoded sizes for subsequent channel switches without retaining media.
const decodedImageSizes = new Map<string, { width: number; height: number }>();
const validDimension = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;
function imageFrame(attachment: MessageAttachment) {
  const size = validDimension(attachment.width) && validDimension(attachment.height) ? { width: attachment.width, height: attachment.height } : decodedImageSizes.get(attachment.url) ?? { width: 320, height: 240 };
  const scale = Math.min(1, 400 / size.width, 380 / size.height);
  return { width: Math.max(1, size.width * scale), height: Math.max(1, size.height * scale) };
}

type AttachmentProps = { attachment: MessageAttachment; inline: boolean; onLoad?: () => void; sender?: MatrixUser; timestamp?: number };
export function AttachmentMessage(props: AttachmentProps) {
  const kind = props.inline ? attachmentMediaKind(props.attachment) : null;
  if (kind === "video" || kind === "audio") return <MediaAttachment attachment={props.attachment} kind={kind} onLoad={props.onLoad} />;
  return <ImageOrFileAttachment {...props} />;
}
function ImageOrFileAttachment({ attachment, inline, onLoad, sender, timestamp }: AttachmentProps) {
  const load = useContext(AttachmentMediaContext);
  const [src, setSrc] = useState<string | null>(null);
  const [decoded, setDecoded] = useState(false);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [retry, setRetry] = useState(0);
  const [viewing, setViewing] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const attachmentKey = JSON.stringify(attachment);
  const frame = useMemo(() => imageFrame(attachment), [attachmentKey]);
  const kind = inline ? attachmentMediaKind(attachment) : null;
  const image = kind === "image";
  const original = useRef<{ key: string; blob: Blob } | null>(null);
  const text = inline && (attachment.mimeType.startsWith("text/") || /\.(txt|md|json|csv|log|ya?ml|xml|ini|toml|js|ts|tsx|jsx|css|html|py|sh|rs|go|c|cpp|h)$/i.test(attachment.name));
  useEffect(() => {
    setPreview(null);
    if (!text || (attachment.size ?? 0) > 1024 * 1024) return;
    const controller = new AbortController();
    void load(attachment, controller.signal).then(async blob => {
      const value = await blob.slice(0, 16384).text();
      if (!controller.signal.aborted && !value.includes("\0")) {
        original.current = { key: attachmentKey, blob };
        const lines = value.split(/\r?\n/);
        setPreview(lines.slice(0, 12).map(line => line.slice(0, 500)).join("\n") + (lines.length > 12 || blob.size > 16384 ? "\n…" : ""));
        onLoad?.();
      }
    }).catch(() => { /* Download remains available when preview cannot load. */ });
    return () => controller.abort();
  }, [attachmentKey, text, load]);
  useEffect(() => {
    setSrc(null); setDecoded(false); setError(""); setViewing(false); setMenu(null);
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
  const copy = async () => {
    setError("");
    try { await copyImage(original.current?.key === attachmentKey ? original.current.blob : await load(attachment)); }
    catch { setError("Image could not be copied. Please try again."); }
  };
  const copyLink = async () => {
    try {
      if (window.desktop?.clipboard) await window.desktop.clipboard.writeText(attachment.url);
      else await navigator.clipboard.writeText(attachment.url);
    } catch { setError("Image link could not be copied."); }
  };
  return <div className={`message-attachment ${image ? "message-attachment--image" : ""}`}>
    {image && <div className="message-attachment__frame" style={{ width: frame.width, aspectRatio: `${frame.width} / ${frame.height}` }} aria-busy={!decoded && !error}>
      {src && <button type="button" className="message-attachment__image" aria-label={`View ${attachment.name}`} onClick={() => setViewing(true)} onContextMenu={event => { event.preventDefault(); event.stopPropagation(); setMenu({ x: event.clientX, y: event.clientY }); }}><img src={src} alt={attachment.name} style={{ opacity: decoded ? 1 : 0 }} onLoad={event => {
        const image = event.currentTarget;
        if (validDimension(image.naturalWidth) && validDimension(image.naturalHeight)) {
          decodedImageSizes.delete(attachment.url);
          decodedImageSizes.set(attachment.url, { width: image.naturalWidth, height: image.naturalHeight });
          if (decodedImageSizes.size > 256) decodedImageSizes.delete(decodedImageSizes.keys().next().value!);
        }
        setDecoded(true); onLoad?.();
      }} onError={() => setError("Image could not be displayed.")} /></button>}
      {!decoded && !error && <div className="message-attachment__skeleton" role="status" aria-label={`Loading ${attachment.name}`}><span className="sr-only">Loading image...</span></div>}
    </div>}

    {!image && <div className="message-attachment__details"><FileText size={22} /><span><strong>{attachment.name}</strong><small>{attachment.size !== undefined ? formatFileSize(attachment.size) : "Attachment"}</small></span><button type="button" className="icon-button" aria-label={`Download ${attachment.name}`} disabled={downloading} onClick={() => void download()}><Download size={18} /></button></div>}
    {preview !== null && <pre className="attachment-text-preview" aria-label={`Preview of ${attachment.name}`}><code>{preview}</code></pre>}
    {error && <div className="message-attachment__error" role="alert">{error} {image && <button type="button" onClick={() => { original.current = null; setRetry(value => value + 1); }}>Retry</button>}</div>}
    {menu && <ImageActionsMenu position={menu} onClose={closeMenu} onView={() => setViewing(true)} onDownload={() => void download()} onCopy={() => void copy()} onCopyLink={copyLink} downloading={downloading} />}
    {viewing && src && <ImageViewer src={src} name={attachment.name} sender={sender} timestamp={timestamp} onClose={() => setViewing(false)} onDownload={() => void download()} onCopy={() => void copy()} onCopyLink={copyLink} downloading={downloading} error={error} />}
  </div>;
}
