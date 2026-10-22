import { useEffect, useRef, useState } from "react";
import { Pin, X } from "lucide-react";
import type { MatrixMessage } from "../../../domain/matrix/MatrixTypes";
import { ThemedPopover } from "../../components/common/ThemedPopover";
import "./PinnedMessages.css";

export function PinnedMessages({ pinnedEventIds, messages, load, onOpen }: {
  pinnedEventIds?: string[];
  messages: MatrixMessage[];
  load: () => Promise<MatrixMessage[]>;
  onOpen: (message: MatrixMessage) => Promise<void>;
}) {
  const anchor = useRef<HTMLButtonElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pins, setPins] = useState<MatrixMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [retry, setRetry] = useState(0);
  const pinKey = JSON.stringify(pinnedEventIds ?? messages.filter(message => message.isPinned).map(message => message.id));
  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true); setError(null);
    void load().then(result => { if (active) setPins(result); })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "Unable to load pinned messages."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, pinKey, load, retry]);
  useEffect(() => { if (open) surface.current?.querySelector<HTMLButtonElement>("button")?.focus(); }, [open]);
  const close = () => { setOpen(false); anchor.current?.focus(); };
  const jump = async (message: MatrixMessage) => {
    setOpening(true); setError(null);
    try { await onOpen(message); close(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to open pinned message."); }
    finally { setOpening(false); }
  };
  return <div className="pinned-messages">
    <button ref={anchor} type="button" className="icon-button" aria-label="Pinned messages" data-tooltip="Pinned messages" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(value => !value)}><Pin /></button>
    {open && <ThemedPopover anchor={anchor} onClose={close} role="dialog" label="Pinned messages" width={360} className="pinned-messages__popover">
      <div ref={surface}>
        <header><strong>Pinned messages</strong><button type="button" className="icon-button" aria-label="Close pinned messages" onClick={close}><X size={16} /></button></header>
        {loading ? <p role="status">Loading pinned messages…</p> : <>
          {error && <div role="alert"><p>{error}</p><button type="button" className="button button--secondary" onClick={() => setRetry(value => value + 1)}>Try again</button></div>}
          {!error && pins.length === 0 && <p>No pinned messages in this conversation.</p>}
          {pins.length > 0 && <ul>{pins.map(pin => {
            const message = messages.find(message => message.id === pin.id) ?? pin;
            return <li key={message.id}><button type="button" className="pinned-messages__entry" disabled={opening} onClick={() => void jump(message)}>
              <span><strong>{message.sender.displayName}</strong><time>{new Date(message.timestamp).toLocaleString("en-US")}</time></span>
              <span>{message.isRedacted ? "Message removed" : message.body || message.attachment?.name || "Message"}</span>
            </button></li>;
          })}</ul>}
        </>}
      </div>
    </ThemedPopover>}
  </div>;
}
