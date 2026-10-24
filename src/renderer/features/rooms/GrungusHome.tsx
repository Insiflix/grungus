import { useEffect, useMemo, useState } from "react";
import { Hash, MessageCircle, Search, Users, UserPlus, Volume2 } from "lucide-react";
import type { MatrixRoom, MatrixUser, MatrixPresence } from "../../../domain/matrix/MatrixTypes";
import type { RoomCall } from "../../../domain/calls/ICallProvider";
import { isVoiceRoom } from "../../../domain/matrix/RoomNavigation";
import { recentConversations } from "../../../domain/matrix/RecentConversations";
import { useMatrixRuntime } from "../../app/providers/MatrixProvider";
import { useMatrixSnapshot } from "../../hooks/matrix/useMatrixSnapshot";
import { Avatar } from "../../components/common/Avatar";
import { presenceLabels } from "../../components/common/PresenceStatus";
import { BlockedUserBadge } from "../../components/common/BlockedUserBadge";

export function GrungusHome({ rooms, calls, channelServers, onOpen, onJoinVoice, callActive, onAddPeople }: {
  rooms: MatrixRoom[];
  calls: RoomCall[];
  channelServers: ReadonlyMap<string, MatrixRoom>;
  onOpen: (id: string) => void;
  onJoinVoice: (room: MatrixRoom) => void;
  callActive: boolean;
  onAddPeople?: () => void;
}) {
  const runtime = useMatrixRuntime();
  const { session, presences, timelines } = useMatrixSnapshot();
  const [query, setQuery] = useState("");
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [directory, setDirectory] = useState<MatrixUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [messageError, setMessageError] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const term = query.trim();
  const known = useMemo(() => {
    const users = new Map<string, MatrixUser & { presence?: MatrixPresence }>();
    for (const room of rooms.filter(room => room.membership === "join")) {
      for (const member of runtime.getRoomMembers(room.id)) {
        if (member.membership === "join" && member.id !== session?.userId) users.set(member.id, member);
      }
      if (room.directUserId && room.directUserId !== session?.userId && !users.has(room.directUserId)) users.set(room.directUserId, { id: room.directUserId, displayName: room.name, avatarUrl: room.avatarUrl });
    }
    return users;
  }, [rooms, runtime, session?.userId]);
  useEffect(() => {
    let current = true;
    setDirectory([]); setSearchError(null); setSearching(Boolean(term));
    if (!term) return;
    const timer = setTimeout(() => {
      void runtime.searchUsers(term).then(users => { if (current) setDirectory(users); }).catch(error => {
        if (current) setSearchError(error instanceof Error ? error.message : "Directory search is unavailable. Known contacts are still shown.");
      }).finally(() => { if (current) setSearching(false); });
    }, 300);
    return () => { current = false; clearTimeout(timer); };
  }, [runtime, term]);
  const users = new Map(known);
  for (const user of directory) if (!users.has(user.id)) users.set(user.id, user);
  if (/^@[^\s:]+:[^\s]+$/.test(term) && term !== session?.userId && !users.has(term)) users.set(term, { id: term, displayName: term, avatarUrl: null });
  const contacts = [...users.values()].filter(user => user.id !== session?.userId &&
    (!term || user.displayName.toLocaleLowerCase().includes(term.toLocaleLowerCase()) || user.id.toLocaleLowerCase().includes(term.toLocaleLowerCase())) &&
    (!onlineOnly || (presences[user.id] ?? user.presence) === "online")
  ).sort((a, b) => a.displayName.localeCompare(b.displayName) || a.id.localeCompare(b.id));
  const missed = recentConversations(rooms.filter(room => room.membership === "join" && !room.isSpace && channelServers.has(room.id) && room.unreadCount > 0), timelines);
  const voiceCalls = calls.flatMap(call => {
    const room = rooms.find(room => room.id === call.roomId && room.membership === "join" && isVoiceRoom(room));
    return room && channelServers.has(room.id) && call.participants > 0 ? [{ call, room }] : [];
  });
  const message = async (user: MatrixUser) => {
    setOpening(user.id); setMessageError(null);
    try { await runtime.startDirectMessage(user.id); }
    catch (error) { setMessageError(error instanceof Error ? error.message : "Could not open this conversation."); }
    finally { setOpening(null); }
  };

  return <div className="grungus-home">
    <header className="home-header"><h1>Home</h1><button type="button" className="button home-add-people" onClick={onAddPeople}><UserPlus size={16} /> Add people</button></header>
    <div className="home-columns">
      <section className="home-contacts" aria-labelledby="home-contacts-title">
        <div className="home-section-heading"><h2 id="home-contacts-title"><Users size={19} /> Contacts</h2><div className="home-filters" aria-label="Filter contacts"><button type="button" aria-pressed={!onlineOnly} onClick={() => setOnlineOnly(false)}>All</button><button type="button" aria-pressed={onlineOnly} onClick={() => setOnlineOnly(true)}>Online</button></div></div>
        <label className="home-search"><Search size={18} /><input aria-label="Search contacts or Matrix directory" placeholder="Search names or Matrix IDs" value={query} onChange={event => setQuery(event.target.value)} /></label>
        {searching && <p className="home-hint" role="status">Searching the directory...</p>}
        {searchError && <p className="settings-inline-error" role="alert">{searchError}</p>}
        {messageError && <p className="settings-inline-error" role="alert">{messageError}</p>}
        <div className="home-contact-count">{onlineOnly ? "Online" : "All contacts"} · {contacts.length}</div>
        <div className="home-contact-list">
          {contacts.map(user => <button type="button" data-profile-user-id={user.id} className="home-contact" key={user.id} disabled={opening !== null} onClick={() => void message(user)} aria-label={`Message ${user.displayName}`}>
            <Avatar name={user.displayName} url={user.avatarUrl} presence={presences[user.id] ?? user.presence ?? "unknown"} />
            <span><strong>{user.displayName}<BlockedUserBadge userId={user.id} /></strong><small>{presenceLabels[presences[user.id] ?? user.presence ?? "unknown"]} · {user.id}</small></span>
            <MessageCircle size={19} />
          </button>)}
          {contacts.length === 0 && <p className="home-empty">{term ? "No matching people. Try a full Matrix ID." : onlineOnly ? "No contacts are online right now." : "Your contacts will appear as your rooms sync. Search for someone to start a conversation."}</p>}
        </div>
      </section>
      <aside className="home-activity" aria-labelledby="home-active-title">
        <h2 id="home-active-title">Active now</h2>
        <section aria-labelledby="home-missed-title"><h3 id="home-missed-title">What you missed <span>{missed.length}</span></h3>
          {missed.map(room => <button type="button" className="home-activity-card" key={room.id} onClick={() => onOpen(room.id)}>
            <Avatar name={channelServers.get(room.id)!.name} url={channelServers.get(room.id)!.avatarUrl} />
            <span><strong><Hash size={14} /> {room.name}</strong><small>{channelServers.get(room.id)!.name}</small><small>{room.unreadCount} unread{room.highlightCount > 0 ? ` · ${room.highlightCount} mentions` : ""}</small></span>
          </button>)}
          {missed.length === 0 && <p className="home-empty">You're all caught up on your channels.</p>}
        </section>
        <section aria-labelledby="home-voice-title"><h3 id="home-voice-title"><Volume2 size={16} /> In voice <span>{voiceCalls.length}</span></h3>
          {voiceCalls.map(({ call, room }) => <div className="home-voice-card" key={room.id}>
            <button type="button" className="home-activity-card" onClick={() => onOpen(room.id)}><Avatar name={channelServers.get(room.id)!.name} url={channelServers.get(room.id)!.avatarUrl} /><span><strong>{room.name}</strong><small>{channelServers.get(room.id)!.name} · {call.participants} in voice</small></span></button>
            {call.members && call.members.length > 0 && <div className="home-voice-members">{call.members.map(member => <span key={member.id} title={member.displayName} data-profile-user-id={member.id} data-voice-room-id={call.roomId}><Avatar name={member.displayName} url={member.avatarUrl} size="small" /><small>{member.displayName}</small></span>)}</div>}
            <button type="button" className="button button--secondary button--compact" disabled={callActive} onClick={() => onJoinVoice(room)}>Join voice</button>
          </div>)}
          {voiceCalls.length === 0 && <p className="home-empty">No one is in your voice channels right now.</p>}
        </section>
      </aside>
    </div>
  </div>;
}
