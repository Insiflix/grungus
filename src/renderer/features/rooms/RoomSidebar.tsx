import { useState, type FormEvent } from "react";
import { Avatar } from "../../components/common/Avatar";
import { Hash as HashIcon, LockKeyhole as LockIcon, Plus as PlusIcon, Search as SearchIcon, UserPlus, ShieldCheck } from "lucide-react";
import { useMatrixRooms } from "../../hooks/matrix/useMatrixRooms";
import { useMatrixSession } from "../../hooks/matrix/useMatrixSession";
import type { MatrixRoom } from "../../../domain/matrix/MatrixTypes";
import { InvitationList } from "./InvitationList";
import { PeopleDialog } from "./PeopleDialog";
import { Settings } from "lucide-react";

export function RoomSidebar({ space, onOpenIdentity, onOpenSettings, onManageSpace }: { space: MatrixRoom | null; onOpenIdentity: () => void; onOpenSettings: () => void; onManageSpace: () => void }) {
  const [filter, setFilter] = useState("");
  const [joining, setJoining] = useState(false);
  const [roomAddress, setRoomAddress] = useState("");
  const [joinPending, setJoinPending] = useState(false);
  const [inviting, setInviting] = useState(false);
  const { rooms: allRooms, selectedRoomId, selectRoom, joinRoom } = useMatrixRooms(filter);
  const searching = Boolean(filter.trim());
  const rooms = allRooms.filter((room) => room.membership === "join" && !room.isSpace && (searching || (!room.isDirect && (!space || space.childRoomIds?.includes(room.id)))));
  const { session, profile, sync } = useMatrixSession();

  const handleJoin = async (event: FormEvent) => {
    event.preventDefault();
    if (!roomAddress.trim()) return;
    setJoinPending(true);
    try {
      if (await joinRoom(roomAddress)) { setRoomAddress(""); setJoining(false); }
    } finally { setJoinPending(false); }
  };

  return (
    <aside className="room-sidebar">
      <header className="sidebar-header">
        <div>
          <span className="sidebar-kicker">YOUR CORNER OF THE FOREST</span>
          <strong>{space?.name ?? "All rooms"}</strong>
        </div>
        {space && <button type="button" className="icon-button" aria-label="Invite people to this server" title="Invite people to this server" onClick={() => setInviting(true)}><UserPlus /></button>}
        {space && <button type="button" className="icon-button" aria-label="Space settings" title="Space settings" onClick={onManageSpace}><Settings /></button>}
        <button type="button" className="icon-button" aria-label="Join room" onClick={() => setJoining((value) => !value)}>
          <PlusIcon />
        </button>
      </header>

      {joining && (
        <form className="join-room" onSubmit={(event) => void handleJoin(event)}>
          <label htmlFor="room-address">Room address</label>
          <input
            id="room-address"
            value={roomAddress}
            onChange={(event) => setRoomAddress(event.target.value)}
            placeholder="#room:example.org"
            disabled={joinPending}
            autoFocus
          />
          <button className="button button--compact" type="submit" disabled={joinPending || !roomAddress.trim()}>{joinPending ? "Joining…" : "Join"}</button>
        </form>
      )}

      <div className="room-search">
        <SearchIcon />
        <input
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Find a room or DM"
          aria-label="Find a room or direct message"
        />
        <kbd>⌘ K</kbd>
      </div>

      <div className="room-section-label">
        <span>{searching ? "Matching chats · all spaces" : "Rooms"}</span>
        <span>{rooms.length}</span>
      </div>
      <div className="room-list" role="list">
        <InvitationList />
        {rooms.map((room) => (
          <button
            type="button"
            className={`room-row ${selectedRoomId === room.id ? "is-selected" : ""}`}
            key={room.id}
            onClick={() => selectRoom(room.id)}
            role="listitem"
          >
            <Avatar name={room.name} url={room.avatarUrl} />
            <span className="room-row__copy">
              <strong>{room.name}</strong>
              <span>{room.isDirect ? "Direct message" : room.topic || `${room.memberCount} members`}</span>
            </span>
            <span className="room-row__meta">
              {room.isEncrypted ? <LockIcon /> : <HashIcon />}
              {room.unreadCount > 0 && (
                <span className={room.highlightCount > 0 ? "mention-badge" : "unread-badge"}>
                  {room.unreadCount > 99 ? "99+" : room.unreadCount}
                </span>
              )}
            </span>
          </button>
        ))}
        {rooms.length === 0 && (
          <div className="empty-rooms">
            <HashIcon />
            <p>{searching ? "No matching chats" : sync.state === "ready" ? "No joined rooms" : "Rooms will appear after sync"}</p>
          </div>
        )}
      </div>

      <footer className="account-strip account-strip--security">
        <Avatar name={profile?.displayName ?? session?.userId ?? "You"} url={profile?.avatarUrl} status />
        <span>
          <strong>{profile?.displayName ?? session?.userId.split(":")[0].replace("@", "")}</strong>
          <small>{sync.state === "ready" ? "Online" : sync.state}</small>
        </span>
        <button type="button" className="icon-button" aria-label="Identität und Verschlüsselung" title="Identität & Verschlüsselung" onClick={onOpenIdentity}><ShieldCheck /></button>
        <button type="button" className="icon-button" aria-label="Settings" title="Settings (Ctrl+,)" onClick={onOpenSettings}>
          <Settings />
        </button>
      </footer>
      {inviting && space && <PeopleDialog key={space.id} room={space} onClose={() => setInviting(false)} />}
    </aside>
  );
}


