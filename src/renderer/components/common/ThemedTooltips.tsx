import { useEffect, useLayoutEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Delegation covers virtualized messages and disabled controls without wrappers.
export function ThemedTooltips() {
  const id = useId(), node = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{target:HTMLElement; text:string; left:number; top:number} | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined, current: HTMLElement | null = null;
    const hide = () => { clearTimeout(timer); current = null; setTip(null); };
    const show = (event: Event) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-tooltip]") : null;
      if (target === current) return;
      hide(); if (!target?.dataset.tooltip) return; current = target;
      const reveal = () => { if (!target.isConnected) return; const rect = target.getBoundingClientRect(); setTip({target,text:target.dataset.tooltip!,left:Math.max(8,Math.min(rect.left+rect.width/2,innerWidth-8)),top:rect.bottom+8}); };
      timer = setTimeout(reveal,event.type === "focusin" ? 0 : 450);
    };
    const leave = (event: Event) => { if (!current?.contains((event as PointerEvent).relatedTarget as Node | null)) hide(); };
    const key = (event: KeyboardEvent) => { if(event.key === "Escape") hide(); };
    document.addEventListener("pointerover",show); document.addEventListener("focusin",show); document.addEventListener("pointerout",leave); document.addEventListener("focusout",hide); document.addEventListener("pointerdown",hide); document.addEventListener("keydown",key);
    window.addEventListener("scroll",hide,true); window.addEventListener("blur",hide); window.addEventListener("resize",hide);
    return () => { hide(); document.removeEventListener("pointerover",show); document.removeEventListener("focusin",show); document.removeEventListener("pointerout",leave); document.removeEventListener("focusout",hide); document.removeEventListener("pointerdown",hide); document.removeEventListener("keydown",key); window.removeEventListener("scroll",hide,true); window.removeEventListener("blur",hide); window.removeEventListener("resize",hide); };
  }, []);
  useEffect(() => {
    const target = tip?.target;
    if (!target) return;
    const observer = new MutationObserver(() => {
      const text = target.dataset.tooltip;
      setTip(current => current?.target === target ? text ? { ...current, text } : null : current);
    });
    observer.observe(target, { attributes: true, attributeFilter: ["data-tooltip"] });
    return () => observer.disconnect();
  }, [tip?.target]);
  useLayoutEffect(() => {
    if (!tip || !node.current) return;
    const tooltip = node.current; tooltip.showPopover?.();
    const rect = tooltip.getBoundingClientRect();
    tooltip.style.left = `${Math.max(8,Math.min(tip.left-rect.width/2,innerWidth-rect.width-8))}px`;
    if(rect.bottom > innerHeight-8) tooltip.style.top = `${Math.max(8,tip.target.getBoundingClientRect().top-rect.height-8)}px`;
    const previous = tip.target.getAttribute("aria-describedby");
    tip.target.setAttribute("aria-describedby",[previous,id].filter(Boolean).join(" "));
    return () => { if(previous) tip.target.setAttribute("aria-describedby",previous); else tip.target.removeAttribute("aria-describedby"); };
  }, [tip,id]);
  return tip && createPortal(<div ref={node} popover="manual" role="tooltip" id={id} className="themed-tooltip" style={{left:tip.left,top:tip.top,display:typeof HTMLElement.prototype.showPopover === "function" ? undefined : "block"}}>{tip.text}</div>,document.body);
}
