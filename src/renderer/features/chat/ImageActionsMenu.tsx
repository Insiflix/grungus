import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Download, Expand, Link } from "lucide-react";

export function ImageActionsMenu({ position, onClose, onDownload, onView, onCopyLink, downloading, portalTarget }: {
  position: { x: number; y: number }; onClose(): void; onDownload(): void; onView(): void; onCopyLink(): void; downloading: boolean; portalTarget?: HTMLElement;
}) {
  const menu = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = menu.current!;
    const previous = document.activeElement as HTMLElement | null;
    const bounds = node.getBoundingClientRect();
    node.style.left = `${Math.max(8, Math.min(position.x, innerWidth - bounds.width - 8))}px`;
    node.style.top = `${Math.max(8, Math.min(position.y, innerHeight - bounds.height - 8))}px`;
    node.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    const outside = (event: Event) => { if (!node.contains(event.target as Node)) onClose(); };
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", onClose);
    return () => { document.removeEventListener("pointerdown", outside); window.removeEventListener("resize", onClose); if (previous?.isConnected) previous.focus(); };
  }, [position, onClose]);
  const run = (action: () => void) => { onClose(); action(); };
  return createPortal(<div className="image-actions-menu" ref={menu} role="menu" aria-label="Image actions" onClick={event => event.stopPropagation()} onContextMenu={event => { event.preventDefault(); event.stopPropagation(); }} onKeyDown={event => {
    event.stopPropagation();
    if (event.key === "Escape" || event.key === "Tab") { event.preventDefault(); onClose(); }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      buttons[event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length]?.focus();
    }
  }}>
    <button role="menuitem" type="button" onClick={() => run(onView)}>View full size <Expand size={17} /></button>
    <button role="menuitem" type="button" disabled={downloading} onClick={() => run(onDownload)}>Download image <Download size={17} /></button>
    <button role="menuitem" type="button" onClick={() => run(onCopyLink)}>Copy image link <Link size={17} /></button>
  </div>, portalTarget ?? document.body);
}
