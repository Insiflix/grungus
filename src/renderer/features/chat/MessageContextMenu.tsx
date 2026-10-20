import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Copy, Pencil, Pin, Reply, SmilePlus, Trash2 } from "lucide-react";
import type { MatrixMessage } from "../../../domain/matrix/MatrixTypes";

export type MessageAction = "reply" | "edit" | "delete" | "pin";

export function MessageContextMenu({ message, position, onClose, onReact, onEmoji, onAction }: {
  message: MatrixMessage;
  position: { x: number; y: number };
  onClose(): void;
  onReact(emoji: string): void | Promise<void>;
  onEmoji(): void;
  onAction(action: MessageAction): void | Promise<void>;
}) {
  const menu = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  useLayoutEffect(() => {
    const element = menu.current!;
    const previousFocus = document.activeElement as HTMLElement | null;
    const rect = element.getBoundingClientRect();
    element.style.left = `${Math.max(8, Math.min(position.x, window.innerWidth - rect.width - 8))}px`;
    element.style.top = `${Math.max(8, Math.min(position.y, window.innerHeight - rect.height - 8))}px`;
    element.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    const outside = (event: Event) => { if (!element.contains(event.target as Node)) onClose(); };
    const scroll = (event: Event) => { if (!element.contains(event.target as Node)) onClose(); };
    document.addEventListener("pointerdown", outside);
    window.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", onClose);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [position, onClose]);
  const run = async (action: () => void | Promise<void>) => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try { await action(); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Message action failed. Please try again."); }
    finally { pending.current = false; setBusy(false); }
  };
  return createPortal(<div ref={menu} className="message-context-menu" role="menu" aria-label="Message actions" style={{ left: position.x, top: position.y }} onContextMenu={event => event.preventDefault()} onKeyDown={event => {
    if (event.key === "Escape" || event.key === "Tab") { event.preventDefault(); onClose(); }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      buttons[event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length]?.focus();
    }
  }}>
    <div className="message-context-menu__reactions" role="group" aria-label="Suggested reactions">
      {["👍", "❤️", "😂", "🎉"].map(emoji => <button role="menuitem" type="button" key={emoji} aria-label={`React with ${emoji}`} disabled={busy} onClick={() => void run(() => onReact(emoji))}>{emoji}</button>)}
      <button role="menuitem" type="button" aria-label="Choose reaction emoji" data-tooltip="More reactions" disabled={busy} onClick={onEmoji}><SmilePlus size={20} /></button>
    </div>
    <button role="menuitem" disabled={busy} onClick={() => void run(() => onAction("reply"))}>Reply <Reply /></button>
    <button role="menuitem" disabled={busy} onClick={() => void run(() => window.desktop?.clipboard ? window.desktop.clipboard.writeText(message.body) : navigator.clipboard.writeText(message.body))}>Copy text <Copy /></button>
    <button role="menuitem" disabled={busy || message.canPin === false} data-tooltip={message.canPin === false ? "You do not have permission to pin messages" : undefined} onClick={() => void run(() => onAction("pin"))}>{message.isPinned ? "Unpin message" : "Pin message"}<Pin /></button>
    {message.isOwn && <>
      {["text", "notice", "emote"].includes(message.type) && <button role="menuitem" disabled={busy} onClick={() => void run(() => onAction("edit"))}>Edit message <Pencil /></button>}
      <button role="menuitem" className="is-danger" disabled={busy} onClick={() => void run(() => onAction("delete"))}>Delete message <Trash2 /></button>
    </>}
    {error && <p role="alert">{error}</p>}
  </div>, document.body);
}
