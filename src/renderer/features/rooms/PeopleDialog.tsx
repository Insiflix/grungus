import { useEffect, useRef, useState, type FormEvent } from "react";
import { Search, UserPlus, X } from "lucide-react";
import type { MatrixRoom, MatrixUser } from "../../../domain/matrix/MatrixTypes";
import { useMatrixRuntime } from "../../app/providers/MatrixProvider";
import { Avatar } from "../../components/common/Avatar";

export function PeopleDialog({ room, onClose }: { room?: MatrixRoom; onClose: () => void }) {
  const runtime = useMatrixRuntime();
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MatrixUser[]>([]);
  const [searched, setSearched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [invited, setInvited] = useState<string[]>([]);
  const requestId = useRef(0);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  const search = async (event: FormEvent) => {
    event.preventDefault();
    const request = ++requestId.current;
    setBusy(true); setError(null); setSuccess(null);
    try {
      const users = await runtime.searchUsers(query.trim());
      if (request === requestId.current) { setResults(users); setSearched(true); }
    } catch (cause) {
      if (request === requestId.current) setError(cause instanceof Error ? cause.message : "Search failed. You can still use a full Matrix ID.");
    } finally {
      if (request === requestId.current) setBusy(false);
    }
  };

  const add = async (user: MatrixUser) => {
    setBusy(true); setError(null); setSuccess(null);
    try {
      if (room) {
        await runtime.inviteUser(room.id, user.id);
        setInvited((current) => [...current, user.id]);
        setSuccess(`Invitation sent to ${user.displayName}.`);
      } else {
        await runtime.startDirectMessage(user.id);
        onClose();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not add this person.");
    } finally { setBusy(false); }
  };

  const fullId = /^@[^\s:]+:[^\s]+$/.test(query.trim());
  const users = fullId && !results.some((user) => user.id === query.trim())
    ? [{ id: query.trim(), displayName: query.trim(), avatarUrl: null }, ...results] : results;

  return (
    <dialog ref={dialog} className="people-dialog" aria-labelledby="people-title" onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
      <header className="people-dialog__header">
        <div><span className="eyebrow">{room ? "ROOM INVITATION" : "NEW CONVERSATION"}</span><h2 id="people-title">{room ? `Invite to ${room.name}` : "Add people"}</h2></div>
        <button type="button" className="icon-button" aria-label="Close" disabled={busy} onClick={onClose}><X /></button>
      </header>
      <p>Find someone by name, or enter their full Matrix ID.</p>
      <form className="people-search" onSubmit={(event) => void search(event)}>
        <label className="sr-only" htmlFor="people-query">Name or Matrix ID</label>
        <input id="people-query" value={query} autoFocus placeholder="@alice:example.org" disabled={busy}
          onChange={(event) => { ++requestId.current; setQuery(event.target.value); setResults([]); setSearched(false); setError(null); setSuccess(null); }} />
        <button type="submit" className="button button--compact" disabled={busy || !query.trim()}><Search size={15} /> {busy ? "Working…" : "Search"}</button>
      </form>
      {error && <p className="error-banner" role="alert">{error}</p>}
      {success && <p className="success-banner" role="status">{success}</p>}
      <div className="people-results" aria-busy={busy}>
        {users.map((user) => (
          <div className="people-result" key={user.id} data-profile-user-id={user.id} tabIndex={0}>
            <Avatar name={user.displayName} url={user.avatarUrl} />
            <span><strong>{user.displayName}</strong><small>{user.id}</small></span>
            <button type="button" className="button button--secondary button--compact" disabled={busy || invited.includes(user.id)} onClick={() => void add(user)}>
              <UserPlus size={15} /> {invited.includes(user.id) ? "Invited" : room ? "Invite" : "Message"}
            </button>
          </div>
        ))}
        {searched && users.length === 0 && <p>No people found. Try their full Matrix ID to reach someone on another server.</p>}
      </div>
    </dialog>
  );
}
