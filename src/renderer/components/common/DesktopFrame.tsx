import { ThemedTooltips } from "./ThemedTooltips";
import { useEffect, useState, type PropsWithChildren } from "react";
import { Copy, Minus, Square, X } from "lucide-react";

export function DesktopFrame({ children }: PropsWithChildren) {
  const controls = window.desktop?.windowControls;
  const [maximized, setMaximized] = useState(false);
  const [error, setError] = useState("");
  const invoke = (operation: () => Promise<unknown>) => { void operation().catch(() => setError("Window action failed.")); };
  useEffect(() => {
    if (!controls) return;
    let active = true;
    void controls.getState().then(state => { if (active) setMaximized(state.maximized); }).catch(() => {});
    const unsubscribe = controls.onStateChange(state => setMaximized(state.maximized));
    return () => { active = false; unsubscribe(); };
  }, [controls]);
  return <div className="desktop-frame">
    <ThemedTooltips />
    {controls && <header className="desktop-titlebar" onDoubleClick={() => invoke(controls.toggleMaximize)}>
      <span className="desktop-titlebar__brand">GRUNGUS</span>
      {error && <span role="alert">{error}</span>}
      <div className="desktop-titlebar__controls" onDoubleClick={event => event.stopPropagation()}>
        <button type="button" aria-label="Minimize window" data-tooltip="Minimize" onClick={() => invoke(controls.minimize)}><Minus size={14} /></button>
        <button type="button" aria-label={maximized ? "Restore window" : "Maximize window"} data-tooltip={maximized ? "Restore" : "Maximize"} onClick={() => invoke(controls.toggleMaximize)}>{maximized ? <Copy size={12} /> : <Square size={12} />}</button>
        <button type="button" className="desktop-titlebar__close" aria-label="Close window" data-tooltip="Close" onClick={() => invoke(controls.close)}><X size={16} /></button>
      </div>
    </header>}
    <div className="desktop-frame__content">{children}</div>
  </div>;
}
