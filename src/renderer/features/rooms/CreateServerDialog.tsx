import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { matrixSettings, useMatrixRuntime } from "../../app/providers/MatrixProvider";

export function CreateServerDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const runtime = useMatrixRuntime();
  const [name, setName] = useState("");
  const [isPublic, setPublic] = useState(false);
  const [pending, setPending] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="create-channel-dialog" aria-label="Create server" onCancel={event => { event.preventDefault(); if (!pending) onClose(); }}>
    <header><div><h2>Create your server</h2><p>A home for your community, text channels, and voice.</p></div><button className="icon-button" aria-label="Close create server" disabled={pending} onClick={onClose}><X /></button></header>
    <form onSubmit={event => {
      event.preventDefault(); setPending(true); setError(null);
      void (async () => {
        const id = createdId ?? await matrixSettings.createRoom(name, true, false, isPublic);
        setCreatedId(id);
        if (!await runtime.joinRoom(id)) throw new Error("Your server was created, but could not be opened yet. Try opening it again.");
        onCreated(id); onClose();
      })().catch(error => setError(error instanceof Error ? error.message : "Unable to create server.")).finally(() => setPending(false));
    }}>
      <label className="settings-field">Server name<input autoFocus required maxLength={255} value={name} disabled={pending || !!createdId} placeholder="My community" onChange={event => setName(event.target.value)} /></label>
      <label className="server-access"><input type="checkbox" checked={isPublic} disabled={pending || !!createdId} onChange={event => setPublic(event.target.checked)} /><span>Anyone can join<small>{isPublic ? "People with your server address can join." : "Only people you invite can join."}</small></span></label>
      <p>Once created, use the + beside your server name to add text and voice channels.</p>
      {error && <p role="alert">{error}</p>}
      <button className="button button--primary" type="submit" disabled={pending || !name.trim()}>{pending ? "Creating…" : createdId ? "Open server" : "Create server"}</button>
    </form>
  </dialog>;
}
