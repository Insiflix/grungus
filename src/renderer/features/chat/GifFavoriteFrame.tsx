import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Copy, ExternalLink, Star } from "lucide-react";
import type { GifResult } from "../../../infrastructure/gifs/KlipyClient";
import { useGifFavorites } from "./GifFavorites";

export function GifFavoriteFrame({ gif, className, children }: { gif: GifResult; className: string; children: ReactNode }) {
  const { isFavorite, toggle } = useGifFavorites();
  const favorite = isFavorite(gif.url);
  const frame = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const close = useCallback(() => setPosition(null), []);
  const label = favorite ? "Remove GIF from favourites" : "Add GIF to favourites";
  return <div ref={frame} className={`${className} gif-favorite-frame`} onContextMenu={event => {
    event.preventDefault(); event.stopPropagation(); setPosition({ x: event.clientX, y: event.clientY });
  }}>
    {children}
    <button type="button" className={`gif-favorite-star${favorite ? " is-favorite" : ""}`} aria-label={label} data-tooltip={label} aria-pressed={favorite} onClick={event => { event.stopPropagation(); toggle(gif); }}><Star size={17} fill={favorite ? "currentColor" : "none"} /></button>
    {position && <GifActionsMenu position={position} onClose={close} portalTarget={frame.current?.closest("dialog") ?? undefined} label={label} favorite={favorite} onToggle={() => toggle(gif)} url={gif.url} />}
  </div>;
}

function GifActionsMenu({ position, onClose, portalTarget, label, favorite, onToggle, url }: {
  position: { x: number; y: number }; onClose(): void; portalTarget?: HTMLElement; label: string; favorite: boolean; onToggle(): void; url: string;
}) {
  const menu = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  useLayoutEffect(() => {
    const node = menu.current!;
    const previous = document.activeElement as HTMLElement | null;
    // Keep the menu above modal dialogs and outside their scrolling/clipping area.
    if (node.showPopover) node.showPopover();
    else node.removeAttribute("popover");
    const bounds = node.getBoundingClientRect();
    node.style.left = `${Math.max(8, Math.min(position.x, window.innerWidth - bounds.width - 8))}px`;
    node.style.top = `${Math.max(8, Math.min(position.y, window.innerHeight - bounds.height - 8))}px`;
    node.querySelector<HTMLButtonElement>("button")?.focus();
    const outside = (event: Event) => { if (!node.contains(event.target as Node)) onClose(); };
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", onClose);
    window.addEventListener("scroll", outside, true);
    return () => {
      document.removeEventListener("pointerdown", outside); window.removeEventListener("resize", onClose); window.removeEventListener("scroll", outside, true);
      if (previous?.isConnected) previous.focus();
    };
  }, [position, onClose]);
  return createPortal(<div ref={menu} popover="manual" className="message-context-menu gif-actions-menu" role="menu" aria-label="GIF actions" onClick={event => event.stopPropagation()} onContextMenu={event => { event.preventDefault(); event.stopPropagation(); }} onKeyDown={event => {
    event.stopPropagation();
    if (["Escape", "Tab"].includes(event.key)) { event.preventDefault(); onClose(); }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button")];
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      buttons[event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length]?.focus();
    }
  }}>
    <button type="button" role="menuitem" onClick={() => { onToggle(); onClose(); }}>{label}<Star size={17} fill={favorite ? "currentColor" : "none"} /></button>
    <button type="button" role="menuitem" onClick={() => { window.open(url, "_blank", "noopener,noreferrer"); onClose(); }}>Open GIF<ExternalLink size={17} /></button>
    <button type="button" role="menuitem" onClick={() => {
      void Promise.resolve().then(() => window.desktop?.clipboard ? window.desktop.clipboard.writeText(url) : navigator.clipboard.writeText(url)).then(onClose).catch(() => setError("Could not copy the GIF link. Please try again."));
    }}>Copy GIF link<Copy size={17} /></button>
    {error && <p role="alert">{error}</p>}
  </div>, portalTarget ?? document.body);
}
