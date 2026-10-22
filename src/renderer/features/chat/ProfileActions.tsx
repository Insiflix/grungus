import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MessageCircle, ShieldCheck } from "lucide-react";
import type { MatrixPeerVerification } from "../../../domain/matrix/MatrixTypes";
import { useMatrixRuntime } from "../../app/providers/MatrixProvider";

type Target = { userId: string; x: number; y: number; container: Element };

/** Profiles opt in with data-profile-user-id; capture keeps message actions separate. */
export function ProfileActions({ onVerification }: { onVerification: () => void }) {
  const runtime = useMatrixRuntime();
  const [target, setTarget] = useState<Target | null>(null);
  const close = useCallback(() => setTarget(null), []);
  useEffect(() => {
    const open = (event: MouseEvent) => {
      const profile = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-profile-user-id]") : null;
      const userId = profile?.dataset.profileUserId;
      if (!profile || !userId || userId === runtime.getSnapshot().session?.userId) return;
      event.preventDefault(); event.stopPropagation();
      const rect = profile.getBoundingClientRect();
      setTarget({ userId, x: event.clientX || rect.left, y: event.clientY || rect.bottom, container: profile.closest("dialog") ?? document.body });
    };
    document.addEventListener("contextmenu", open, true);
    return () => document.removeEventListener("contextmenu", open, true);
  }, [runtime]);
  return target && <ProfileMenu key={target.userId} target={target} onClose={close} onVerification={onVerification} />;
}

function ProfileMenu({ target, onClose, onVerification }: { target: Target; onClose: () => void; onVerification: () => void }) {
  const runtime = useMatrixRuntime();
  const menu = useRef<HTMLDivElement>(null);
  const pending = useRef(false);
  const [status, setStatus] = useState<MatrixPeerVerification>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    try { return runtime.observeUserVerification(target.userId, setStatus); }
    catch { setStatus("unavailable"); }
  }, [runtime, target.userId]);
  useLayoutEffect(() => {
    const element = menu.current!;
    if (element.showPopover) element.showPopover();
    else element.removeAttribute("popover");
    const rect = element.getBoundingClientRect();
    element.style.left = `${Math.max(8, Math.min(target.x, window.innerWidth - rect.width - 8))}px`;
    element.style.top = `${Math.max(8, Math.min(target.y, window.innerHeight - rect.height - 8))}px`;
    const previous = document.activeElement as HTMLElement | null;
    element.querySelector<HTMLButtonElement>("button")?.focus();
    const outside = (event: Event) => { if (!element.contains(event.target as Node)) onClose(); };
    document.addEventListener("pointerdown", outside);
    window.addEventListener("scroll", outside, true);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("scroll", outside, true);
      window.removeEventListener("resize", onClose);
      if (previous?.isConnected) previous.focus();
    };
  }, [target, onClose]);
  const run = async (action: () => Promise<void>) => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try { await action(); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to complete profile action."); }
    finally { pending.current = false; setBusy(false); }
  };
  return createPortal(<div ref={menu} popover="manual" className="message-context-menu profile-actions-menu" role="menu" aria-label={`Profile actions for ${target.userId}`} onContextMenu={event => event.preventDefault()} onKeyDown={event => {
    if (event.key === "Escape" || event.key === "Tab") { event.preventDefault(); event.stopPropagation(); onClose(); }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      buttons[event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length]?.focus();
    }
  }}>
    <button role="menuitem" disabled={busy} onClick={() => void run(() => runtime.startDirectMessage(target.userId))}>Send DM <MessageCircle /></button>
    {(status === "unverified" || status === "changed") && <button role="menuitem" disabled={busy} onClick={() => void run(async () => { await runtime.requestUserVerification(target.userId); onVerification(); })}>Verify user <ShieldCheck /></button>}
    {!status && <p role="status">Checking verification…</p>}
    {status === "unavailable" && <p>Verification unavailable. Wait for encryption to synchronize.</p>}
    {error && <p role="alert">{error}</p>}
  </div>, target.container);
}
