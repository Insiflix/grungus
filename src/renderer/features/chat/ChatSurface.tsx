import "./ChatSurface.css";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

interface Contour { path: string; width: number; height: number; top: number; flushLeft: boolean }

// One silhouette gives the tab and pane the same glass backdrop and border.
export function ChatSurface({ activeRoomId, children }: { activeRoomId: string | null; children: ReactNode }) {
  const surface = useRef<HTMLDivElement>(null);
  const measureNow = useRef<() => void>(() => {});
  const [contour, setContour] = useState<Contour | null>(null);
  useLayoutEffect(() => {
    const root = surface.current;
    if (!root) return;
    const nav = root.querySelector<HTMLElement>(".dm-tabs");
    const pane = root.querySelector<HTMLElement>(".chat-workspace");
    if (!nav || !pane) return;
    let frame = 0;
    let disposed = false;
    const measure = () => {
      frame = 0;
      const tab = nav.querySelector<HTMLElement>('.dm-tab[aria-current="page"]');
      const bounds = root.getBoundingClientRect();
      const panel = pane.getBoundingClientRect();
      const active = tab?.getBoundingClientRect();
      const width = bounds.width, height = bounds.height;
      const top = panel.top - bounds.top;
      const left = active ? active.left - bounds.left : 0;
      const right = active ? active.right - bounds.left : 0;
      const tabTop = active ? active.top - bounds.top : 0;
      const corner = 16, shoulder = 10, cap = 12;
      const flushLeft = left >= -.5 && left < 1;
      // A manually scrolled-out tab keeps its usual selected appearance.
      if (!active || width < 100 || height <= top + corner * 2 || (!flushLeft && left < corner + shoulder - .5) || right > width - corner - shoulder + .5) {
        setContour(previous => previous === null ? previous : null); return;
      }
      const x = (value: number) => Math.round(value * 100) / 100;
      const path = [
        ...(flushLeft ? [
          `M .5 ${x(tabTop + cap)} Q .5 ${x(tabTop)} ${cap} ${x(tabTop)}`,
        ] : [
          `M ${corner} ${x(top)}`,
          `H ${x(left - shoulder)} Q ${x(left)} ${x(top)} ${x(left)} ${x(top - shoulder)}`,
          `V ${x(tabTop + cap)} Q ${x(left)} ${x(tabTop)} ${x(left + cap)} ${x(tabTop)}`,
        ]),
        `H ${x(right - cap)} Q ${x(right)} ${x(tabTop)} ${x(right)} ${x(tabTop + cap)}`,
        `V ${x(top - shoulder)} Q ${x(right)} ${x(top)} ${x(right + shoulder)} ${x(top)}`,
        `H ${x(width - corner)} Q ${x(width - .5)} ${x(top)} ${x(width - .5)} ${x(top + corner)}`,
        `V ${x(height - corner)} Q ${x(width - .5)} ${x(height - .5)} ${x(width - corner)} ${x(height - .5)}`,
        `H ${corner} Q .5 ${x(height - .5)} .5 ${x(height - corner)}`,
        flushLeft ? `V ${x(tabTop + cap)} Z` : `V ${x(top + corner)} Q .5 ${x(top)} ${corner} ${x(top)} Z`,
      ].join(" ");
      setContour(previous => previous?.path === path ? previous : { path, width, height, top, flushLeft });
    };
    measureNow.current = measure;
    const schedule = () => { if (!disposed && !frame) frame = requestAnimationFrame(measure); };
    const resize = new ResizeObserver(schedule);
    resize.observe(root); resize.observe(nav); resize.observe(pane);
    const changes = new MutationObserver(schedule);
    changes.observe(nav, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["aria-current", "class"] });
    nav.addEventListener("scroll", schedule, true);
    void document.fonts.ready.then(schedule);
    measure();
    return () => { measureNow.current = () => {}; disposed = true; cancelAnimationFrame(frame); resize.disconnect(); changes.disconnect(); nav.removeEventListener("scroll", schedule, true); };
  }, []);
  useLayoutEffect(() => {
    surface.current?.querySelector<HTMLElement>('.dm-tab[aria-current="page"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
    measureNow.current();
  }, [activeRoomId]);
  return <div ref={surface} className={`conversation-surface ${contour ? "has-connected-tab" : ""} ${contour?.flushLeft ? "has-flush-tab" : ""}`}>
    {contour && <>
      <div className="conversation-surface__glass conversation-surface__tab-glass" style={{ height: contour.top, clipPath: `path("${contour.path}")` }} aria-hidden="true" />
      <div className="conversation-surface__glass conversation-surface__pane-glass" style={{ top: contour.top }} aria-hidden="true" />
      <svg className="conversation-surface__outline" viewBox={`0 0 ${contour.width} ${contour.height}`} preserveAspectRatio="none" aria-hidden="true"><path d={contour.path} /></svg>
    </>}
    {children}
  </div>;
}
