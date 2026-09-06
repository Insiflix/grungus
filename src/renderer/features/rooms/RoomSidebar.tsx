import { useState, type FormEvent } from "react";
import { Avatar } from "../../components/common/Avatar";
import { Hash as HashIcon, LockKeyhole as LockIcon, LogOut as LogoutIcon, Plus as PlusIcon, Search as SearchIcon } from "lucide-react";
import { useMatrixRooms } from "../../hooks/matrix/useMatrixRooms";
import { useMatrixSession } from "../../hooks/matrix/useMatrixSession";

export function RoomSidebar() {
  const [filter, setFilter] = useState("");
  const [joining, setJoining] = useState(false);
  const [roomAddress, setRoomAddress] = useState("");
  const { rooms, selectedRoomId, selectRoom, joinRoom } = useMatrixRooms(filter);
  const { session, sync, logout } = useMatrixSession();

  const handleJoin = async (event: FormEvent) => {
    event.preventDefault();
    if (!roomAddress.trim()) return;
    await joinRoom(roomAddress);
    setRoomAddress("");
    setJoining(false);
  };

  return (
    <aside className="room-sidebar">
      <header className="sidebar-header">
        <div>
          <span className="sidebar-kicker">ROOMS</span>
          <strong>Joined rooms</strong>
        </div>
        <button className="icon-button" aria-label="Join room" onClick={() => setJoining((value) => !value)}>
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
            autoFocus
          />
          <button className="button button--compact" type="submit">Join</button>
        </form>
      )}

      <div className="room-search">
        <SearchIcon />
        <input
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Find a room"
          aria-label="Find a room"
        />
        <kbd>⌘ K</kbd>
      </div>

      <div className="room-section-label">
        <span>Rooms</span>
        <span>{rooms.length}</span>
      </div>
      <div className="room-list" role="list">
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
              <span>{room.topic || `${room.memberCount} members`}</span>
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
            <p>{filter ? "No matching rooms" : sync.state === "ready" ? "No joined rooms" : "Rooms will appear after sync"}</p>
          </div>
        )}
      </div>

      <footer className="account-strip">
        <Avatar name={session?.userId ?? "You"} status />
        <span>
          <strong>{session?.userId.split(":")[0].replace("@", "")}</strong>
          <small>{sync.state === "ready" ? "Online" : sync.state}</small>
        </span>
        <button className="icon-button" aria-label="Log out" title="Log out" onClick={() => void logout()}>
          <LogoutIcon />
        </button>
      </footer>
    </aside>
  );
}


