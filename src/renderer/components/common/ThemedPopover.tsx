import { useLayoutEffect, useRef, type RefObject, type ReactNode } from "react";
import { createPortal } from "react-dom";

// A custom surface in the top layer also works inside modal settings dialogs.
// Keep its DOM under the trigger so parent overlays recognize internal clicks.
export function ThemedPopover({ anchor, onClose, children, className = "", role, id, label, width }: {
  anchor: RefObject<HTMLElement | null>; onClose: () => void; children: ReactNode;
  className?: string; role?: "listbox" | "dialog"; id?: string; label?: string; width?: number;
}) {
  const surface = useRef<HTMLDivElement>(null);
  const close = useRef(onClose); close.current = onClose;
  useLayoutEffect(() => {
    const node = surface.current, trigger = anchor.current;
    if (!node || !trigger) return;
    node.showPopover?.();
    const position = () => {
      const rect = trigger.getBoundingClientRect();
      const size = Math.min(width ?? Math.max(180, rect.width), innerWidth - 16);
      const below = innerHeight - rect.bottom - 14, above = rect.top - 14;
      const up = below < 240 && above > below;
      Object.assign(node.style, { width: `${size}px`, maxHeight: `${Math.max(80, Math.min(340, up ? above : below))}px`, left: `${Math.max(8, Math.min(rect.left, innerWidth - size - 8))}px` });
      node.style.top = `${up ? Math.max(8, rect.top - node.getBoundingClientRect().height - 6) : rect.bottom + 6}px`;
    };
    position();
    const outside = (event: Event) => { if (event.target instanceof Node && !node.contains(event.target) && !trigger.parentElement?.contains(event.target)) close.current(); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close.current(); (trigger.matches("button,input") ? trigger : trigger.querySelector<HTMLElement>("button,input"))?.focus(); } };
    document.addEventListener("pointerdown", outside, true); document.addEventListener("focusin", outside, true);
    node.addEventListener("keydown", escape); trigger.addEventListener("keydown", escape);
    const blur = () => close.current();
    window.addEventListener("blur", blur);
    window.addEventListener("resize", position); window.addEventListener("scroll", position, true);
    return () => { document.removeEventListener("pointerdown", outside, true); document.removeEventListener("focusin", outside, true); node.removeEventListener("keydown", escape); trigger.removeEventListener("keydown", escape); window.removeEventListener("blur", blur); window.removeEventListener("resize", position); window.removeEventListener("scroll", position, true); };
  }, [anchor, width]);
  return createPortal(<div ref={surface} style={{display:typeof HTMLElement.prototype.showPopover === "function" ? undefined : "block"}} popover="manual" data-themed-overlay className={`themed-popover ${className}`} role={role} id={id} aria-label={label}>{children}</div>, anchor.current?.parentElement ?? document.body);
}
