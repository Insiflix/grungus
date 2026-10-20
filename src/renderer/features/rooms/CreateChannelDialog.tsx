import { useEffect, useRef, useState } from "react";
import { Hash, Volume2, X } from "lucide-react";
import { matrixSettings } from "../../app/providers/MatrixProvider";
import type { MatrixRoom } from "../../../domain/matrix/MatrixTypes";

export function CreateChannelDialog({ space, onClose, onCreated }: { space: MatrixRoom; onClose: () => void; onCreated: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState("");
  const [voice, setVoice] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="create-channel-dialog" onCancel={event => { event.preventDefault(); if (!pending) onClose(); }}>
    <header><div><h2>Create channel</h2><p>In {space.name}</p></div><button type="button" className="icon-button" aria-label="Close create channel" disabled={pending} onClick={onClose}><X /></button></header>
    <form onSubmit={event => {
      event.preventDefault(); setPending(true); setError(null);
      void matrixSettings.createSpaceChannel(space.id, name, voice).then(() => { onCreated(); onClose(); }).catch(error => setError(error instanceof Error ? error.message : "Unable to create channel.")).finally(() => setPending(false));
    }}>
      <fieldset disabled={pending}><legend>Channel type</legend>
        <label className="channel-type"><input type="radio" name="channel-type" checked={!voice} onChange={() => setVoice(false)} /><Hash /><span><strong>Text</strong><small>Messages, images, and files</small></span></label>
        <label className="channel-type"><input type="radio" name="channel-type" checked={voice} onChange={() => setVoice(true)} /><Volume2 /><span><strong>Voice</strong><small>A place to talk and hang out</small></span></label>
      </fieldset>
      <label className="settings-field">Channel name<input autoFocus required maxLength={255} value={name} disabled={pending} placeholder={voice ? "Lounge" : "general"} onChange={event => setName(event.target.value)} /></label>
      <p>Server members can join this channel without an invitation.</p>
      {error && <p role="alert">{error}</p>}
      <button type="submit" className="button button--primary" disabled={pending || !name.trim()}>{pending ? "Creating…" : "Create channel"}</button>
    </form>
  </dialog>;
}
