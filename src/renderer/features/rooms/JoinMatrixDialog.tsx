import { useEffect, useRef, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { matrixRoomAddress, matrixServerName, type MatrixDirectoryPage } from "../../../domain/matrix/MatrixDirectory";
import { useMatrixRuntime } from "../../app/providers/MatrixProvider";

export function JoinMatrixDialog({ onClose, onJoined }: { onClose: () => void; onJoined: (id: string) => void }) {
  const runtime = useMatrixRuntime();
  const dialog = useRef<HTMLDialogElement>(null);
  const [server, setServer] = useState("");
  const [term, setTerm] = useState("");
  const [address, setAddress] = useState("");
  const [page, setPage] = useState<MatrixDirectoryPage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);

  const search = async (more = false) => {
    setBusy(true); setError(null);
    if (!more) setPage(null);
    try {
      const result = await runtime.searchPublicRooms(matrixServerName(server), term, more ? page?.nextBatch : undefined);
      setPage(previous => ({ ...result, rooms: more ? [...new Map([...(previous?.rooms ?? []), ...result.rooms].map(room => [room.id, room])).values()] : result.rooms }));
    } catch (cause) { setError(`Could not load this directory. The server may restrict it. You can still try a room address. ${cause instanceof Error ? cause.message : ""}`); }
    finally { setBusy(false); }
  };

  const join = async (value: string, via: string[] = []) => {
    setBusy(true); setError(null);
    try {
      const target = matrixRoomAddress(value, via);
      if (!await runtime.joinRoom(target.address, target.viaServers.length ? target.viaServers : undefined)) {
        throw new Error("Could not join. Check the room address, invitation requirements, and your homeserver's federation settings.");
      }
      const id = runtime.getSnapshot().selectedRoomId;
      if (id) onJoined(id);
      onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not join this room."); }
    finally { setBusy(false); }
  };

  return <dialog ref={dialog} className="people-dialog" aria-labelledby="join-matrix-title" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <header className="people-dialog__header"><div><span className="eyebrow">MATRIX FEDERATION</span><h2 id="join-matrix-title">Explore other Matrix servers</h2></div><button type="button" className="icon-button" aria-label="Close" disabled={busy} onClick={onClose}><X /></button></header>
    <p>Use your current account to join rooms and spaces on other instances. A homeserver hosts accounts; spaces organize rooms.</p>
    <form onSubmit={(event: FormEvent) => { event.preventDefault(); void search(); }}>
      <label className="settings-field">Matrix server<input autoFocus required placeholder="matrix.org" disabled={busy} value={server} onChange={event => { setServer(event.target.value); setPage(null); }} /></label>
      <label className="settings-field">Search public rooms<input placeholder="Room name or topic (optional)" disabled={busy} value={term} onChange={event => { setTerm(event.target.value); setPage(null); }} /></label>
      <button className="button button--secondary" disabled={busy || !server.trim()}>Browse rooms</button>
    </form>
    <div className="people-results" aria-busy={busy}>
      {page?.rooms.map(room => <div className="people-result" key={room.id}><span className="matrix-directory-copy"><strong>{room.name}</strong><small>{room.alias || room.id}</small><small>{room.isSpace ? "Space" : "Room"} · {room.memberCount} members</small>{room.topic && <small>{room.topic}</small>}</span><button className="button button--compact" disabled={busy} onClick={() => void join(room.alias || room.id, [server.trim()])}>Join</button></div>)}
      {page?.rooms.length === 0 && <p>No public rooms found. Try a room address below.</p>}
      {page?.nextBatch && <button className="button button--secondary" disabled={busy} onClick={() => void search(true)}>Load more</button>}
    </div>
    <p>Have an address or invitation link? Join directly, even if the room is absent from the directory.</p>
    <form onSubmit={event => { event.preventDefault(); void join(address); }}>
      <label className="settings-field">Room address or matrix.to link<input required placeholder="#room:example.org" disabled={busy} value={address} onChange={event => setAddress(event.target.value)} /></label>
      <button className="button button--primary" disabled={busy || !address.trim()}>Join room or space</button>
    </form>
    {busy && <p role="status">Working…</p>}
    {error && <p className="error-banner" role="alert">{error}</p>}
    <p>To message someone on another instance, use Add people and enter @name:their-server.org. Both homeservers must allow federation.</p>
  </dialog>;
}
