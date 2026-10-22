import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ShieldAlert, X } from "lucide-react";
import { Avatar } from "../../components/common/Avatar";

export function AcceptPeerIdentityDialog({ userId, name, avatarUrl, onAccept, onClose }: {
  userId: string;
  name: string;
  avatarUrl?: string | null;
  onAccept: () => Promise<void>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  const accept = async () => {
    if (busy) return;
    setBusy(true); setError(null);
    try { await onAccept(); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not accept the new identity. Please try again."); setBusy(false); }
  };
  return createPortal(<dialog ref={dialog} className="people-dialog peer-identity-dialog" aria-labelledby="accept-peer-identity-title" aria-describedby="accept-peer-identity-description" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <header className="peer-identity-dialog__header">
      <span className="peer-identity-dialog__symbol"><ShieldAlert size={22} aria-hidden="true" /></span>
      <div><span className="eyebrow">Security</span><h2 id="accept-peer-identity-title">Accept new identity?</h2></div>
      <button type="button" className="icon-button" aria-label="Close" disabled={busy} onClick={onClose}><X size={18} /></button>
    </header>
    <div className="peer-identity-dialog__person"><Avatar name={name} url={avatarUrl} /><div><strong>{name}</strong><small>{userId}</small></div></div>
    <div className="peer-identity-dialog__body" id="accept-peer-identity-description">
      <p>Only accept if you know this person reset their identity.</p>
      <p>This clears the change warning and saves their new identity. It does not verify their identity.</p>
    </div>
    {error && <p className="error-banner" role="alert">{error}</p>}
    <footer className="peer-identity-dialog__actions"><button type="button" className="button button--secondary" autoFocus disabled={busy} onClick={onClose}>Cancel</button><button type="button" className="button button--primary" disabled={busy} onClick={() => void accept()}>{busy ? "Accepting..." : "Accept new identity"}</button></footer>
  </dialog>, document.body);
}
