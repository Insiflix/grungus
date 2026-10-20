import { useState, type FormEvent, type RefCallback } from "react";
import { Avatar } from "../../components/common/Avatar";
import { Hash as HashIcon, LockKeyhole as LockIcon, Plus as PlusIcon, Search as SearchIcon, UserPlus, ShieldCheck } from "lucide-react";
import { useMatrixRooms } from "../../hooks/matrix/useMatrixRooms";
import { useMatrixSession } from "../../hooks/matrix/useMatrixSession";
import type { MatrixRoom } from "../../../domain/matrix/MatrixTypes";
import { InvitationList } from "./InvitationList";
import { PeopleDialog } from "./PeopleDialog";
import { Settings } from "lucide-react";
import type { RoomCall } from "../../../domain/calls/ICallProvider";
import { spaceRoomIds } from "../../../domain/matrix/RoomNavigation";
import { SpaceChannels } from "./SpaceChannels";
import { CreateChannelDialog } from "./CreateChannelDialog";
import { BlockedUserBadge } from "../../components/common/BlockedUserBadge";

export function RoomSidebar({ space, onOpenIdentity, onOpenSettings, onManageSpace, calls = [], onJoinVoice, callActive = false, discoveryPending = false, discoveryError, onRetryDiscovery, voiceDockRef }: { space: MatrixRoom | null; onOpenIdentity: () => void; onOpenSettings: () => void; onManageSpace: () => void; calls?: RoomCall[]; onJoinVoice?: (room: MatrixRoom) => void; callActive?: boolean; discoveryPending?: boolean; discoveryError?: string; onRetryDiscovery?: () => void; voiceDockRef?: RefCallback<HTMLDivElement> }) {
  const [filter, setFilter] = useState("");
  const [joining, setJoining] = useState(false);
  const [roomAddress, setRoomAddress] = useState("");
  const [joinPending, setJoinPending] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [creatingChannel, setCreatingChannel] = useState(false);
  const { rooms: allRooms, spaceRooms = {}, selectedRoomId, selectRoom, joinRoom } = useMatrixRooms(filter);
  const searching = Boolean(filter.trim());
  const serverRoomIds = spaceRoomIds(allRooms.filter(room => room.isSpace), spaceRooms);
  const discovered = space ? spaceRooms[space.id] ?? [] : [];
  const channelIds = new Set([...(space?.childRoomIds ?? []), ...discovered.map(room => room.id)]);
  const channels = [...new Map([...discovered, ...allRooms.filter(room => channelIds.has(room.id))].map(room => [room.id, room])).values()].filter(room => !room.isSpace);
  const rooms = allRooms.filter(room => room.membership === "join" && !room.isSpace && (searching || (!room.isDirectClosed && !serverRoomIds.has(room.id))));
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
          <span className="sidebar-kicker">{space ? "SERVER" : "YOUR CONVERSATIONS"}</span>
          <strong>{space?.name ?? "Messages"}</strong>
        </div>
        {space && <button type="button" className="icon-button" aria-label="Invite people to this server" data-tooltip="Invite people to this server" onClick={() => setInviting(true)}><UserPlus /></button>}
        {space && <button type="button" className="icon-button" aria-label="Space settings" data-tooltip="Space settings" onClick={onManageSpace}><Settings /></button>}
        <button type="button" className="icon-button" aria-label={space ? "Create channel" : "Join room"} data-tooltip={space ? "Create channel" : "Join room"} onClick={() => space ? setCreatingChannel(true) : setJoining((value) => !value)}>
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

      <div className="room-list" role="list">
        <InvitationList roomIds={space && !searching ? channelIds : undefined} excludedRoomIds={!space && !searching ? serverRoomIds : undefined} />
        {space && !searching ? <>
          {discoveryPending && <p className="channel-notice" role="status">Discovering channels…</p>}
          {discoveryError && <p className="channel-notice" role="alert">{discoveryError} <button type="button" onClick={onRetryDiscovery}>Retry</button></p>}
          <SpaceChannels rooms={channels} selectedRoomId={selectedRoomId} calls={calls} callActive={callActive} onOpen={async (channel, voice) => {
            if (channel.membership !== "join") { if (!await joinRoom(channel.id, channel.viaServers)) return; }
            else selectRoom(channel.id);
            if (voice) onJoinVoice?.(channel);
          }} />
        </> : <>
        {(!searching ? [false, true] : [false]).map(group => <div key={String(group)}>
        <div className="room-section-label"><span>{searching ? "Matching chats · all spaces" : group ? "Group chats" : "Direct messages"}</span></div>
        {rooms.filter(room => searching || ((!room.isDirect || room.memberCount > 2) === group)).map((room) => (
          <button
            type="button"
            className={`room-row ${selectedRoomId === room.id ? "is-selected" : ""}`}
            key={room.id}
            onClick={() => selectRoom(room.id)}
            role="listitem"
          >
            <Avatar name={room.name} url={room.avatarUrl} />
            <span className="room-row__copy">
              <strong><span className="user-name-label">{room.name}</span>{room.isDirect && room.memberCount <= 2 && <BlockedUserBadge userId={room.directUserId} />}</strong>
              <span>{room.isDirect && room.memberCount <= 2 ? "Direct message" : `${room.memberCount} members`}</span>
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
        </div>)}
        {rooms.length === 0 && (
          <div className="empty-rooms">
            <HashIcon />
            <p>{searching ? "No matching chats" : sync.state === "ready" ? "No joined rooms" : "Rooms will appear after sync"}</p>
          </div>
        )}
        </>}
      </div>

      <div className="voice-dock-slot" ref={voiceDockRef} />
      <footer className="account-strip account-strip--security">
        <Avatar name={profile?.displayName ?? session?.userId ?? "You"} url={profile?.avatarUrl} status />
        <span>
          <strong>{profile?.displayName ?? session?.userId.split(":")[0].replace("@", "")}</strong>
          <small>{sync.state === "ready" ? "Online" : sync.state}</small>
        </span>
        <button type="button" className="icon-button" aria-label="Identität und Verschlüsselung" data-tooltip="Identität & Verschlüsselung" onClick={onOpenIdentity}><ShieldCheck /></button>
        <button type="button" className="icon-button" aria-label="Settings" data-tooltip="Settings (Ctrl+,)" onClick={onOpenSettings}>
          <Settings />
        </button>
      </footer>
      {inviting && space && <PeopleDialog key={space.id} room={space} onClose={() => setInviting(false)} />}
      {creatingChannel && space && <CreateChannelDialog space={space} onClose={() => setCreatingChannel(false)} onCreated={() => onRetryDiscovery?.()} />}
    </aside>
  );
}


