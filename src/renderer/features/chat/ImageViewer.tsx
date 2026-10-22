import { useCallback, useEffect, useRef, useState } from "react";
import { Download, MoreHorizontal, X, ZoomIn, ZoomOut } from "lucide-react";
import type { MatrixUser } from "../../../domain/matrix/MatrixTypes";
import { Avatar } from "../../components/common/Avatar";
import { ImageActionsMenu } from "./ImageActionsMenu";

export function ImageViewer({ src, name, sender, timestamp, onClose, onDownload, onCopy, onCopyLink, downloading, error }: {
  src: string; name: string; sender?: MatrixUser; timestamp?: number; onClose(): void; onDownload(): void; onCopy(): void; onCopyLink(): void; downloading: boolean; error: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const image = useRef<HTMLButtonElement>(null);
  const [zoomed, setZoomed] = useState(false);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const magnification = 2.5;
  const panTo = (clientX: number, clientY: number) => {
    const viewport = stage.current;
    const picture = image.current;
    if (!viewport || !picture) return;
    const bounds = viewport.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (clientX - bounds.left) / (bounds.width || 1)));
    const y = Math.max(0, Math.min(1, (clientY - bounds.top) / (bounds.height || 1)));
    setPan({
      x: (1 - 2 * x) * Math.max(0, (picture.offsetWidth * magnification - bounds.width) / 2),
      y: (1 - 2 * y) * Math.max(0, (picture.offsetHeight * magnification - bounds.height) / 2),
    });
  };
  const toggleZoom = () => { setPan({ x: 0, y: 0 }); setZoomed(value => !value); };
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const node = dialog.current!;
    node.showModal();
    node.querySelector<HTMLButtonElement>(".image-viewer__close")?.focus();
    return () => { node.close(); if (previous?.isConnected) previous.focus(); };
  }, []);
  return <dialog ref={dialog} className="image-viewer" aria-label={`Image viewer: ${name}`} onCancel={event => { event.preventDefault(); if (menu) closeMenu(); else onClose(); }} onClick={event => { event.stopPropagation(); if (event.target === event.currentTarget) onClose(); }} onContextMenu={event => { event.preventDefault(); event.stopPropagation(); setMenu({ x: event.clientX, y: event.clientY }); }}>
    <header className="image-viewer__header">
      <div className="image-viewer__sender">{sender && <Avatar name={sender.displayName} url={sender.avatarUrl} />}<span><strong>{sender?.displayName ?? "Image"}</strong>{timestamp !== undefined && <time dateTime={new Date(timestamp).toISOString()}>{new Date(timestamp).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</time>}</span></div>
      <div className="image-viewer__controls">
        <div className="image-viewer__toolbar">
          <button type="button" aria-label={zoomed ? "Fit image to window" : "Zoom image"} aria-pressed={zoomed} data-tooltip={zoomed ? "Zoom out" : "Zoom in (250%)"} onClick={toggleZoom}>{zoomed ? <ZoomOut size={19} /> : <ZoomIn size={19} />}</button>
          <button type="button" aria-label="Download image" data-tooltip="Download" disabled={downloading} onClick={onDownload}><Download size={19} /></button>
          <button type="button" aria-label="More image options" aria-haspopup="menu" aria-expanded={Boolean(menu)} onClick={event => { const rect = event.currentTarget.getBoundingClientRect(); setMenu({ x: rect.right - 220, y: rect.bottom + 8 }); }}><MoreHorizontal size={21} /></button>
        </div>
        <button type="button" className="image-viewer__close" aria-label="Close image viewer" data-tooltip="Close (Esc)" onClick={onClose}><X size={22} /></button>
      </div>
    </header>
    <div ref={stage} className={`image-viewer__stage ${zoomed ? "is-zoomed" : ""}`} onPointerMove={event => { if (zoomed && event.pointerType !== "touch") panTo(event.clientX, event.clientY); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
      <button ref={image} type="button" className="image-viewer__image" style={{ transform: `translate(${zoomed ? pan.x : 0}px, ${zoomed ? pan.y : 0}px) scale(${zoomed ? magnification : 1})` }} aria-label={zoomed ? "Fit image to window" : "Zoom into image"} aria-pressed={zoomed} onClick={toggleZoom}><img src={src} alt={name} draggable={false} /></button>
    </div>
    {error && <p className="image-viewer__error" role="alert">{error}</p>}
    {menu && <ImageActionsMenu position={menu} onClose={closeMenu} onDownload={onDownload} onView={() => { setPan({ x: 0, y: 0 }); setZoomed(true); }} onCopy={onCopy} onCopyLink={onCopyLink} downloading={downloading} portalTarget={dialog.current!} />}
  </dialog>;
}
