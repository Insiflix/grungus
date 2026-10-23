import { ChatSurface } from "./ChatSurface";
import { channelTabVisible, hiddenTopChannels } from "../../../domain/settings/HiddenTopChannels";
import { GrungusHome } from "../rooms/GrungusHome";
import { Avatar } from "../../components/common/Avatar";
import { usePreferences } from "../../hooks/usePreferences";
import { latestMessageTime, recentConversations } from "../../../domain/matrix/RecentConversations";
import { DirectCallPanel } from "./DirectCallPanel";
import type { DirectCallState } from "../../../domain/calls/DirectCall";
import { directCalls } from "../../app/providers/MatrixProvider";
import { observeCalls } from "../../app/providers/MatrixProvider";
import type { RoomCall } from "../../../domain/calls/ICallProvider";
import { CallPanel } from "./CallPanel";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { X, Phone } from "lucide-react";
import { MessageSearch } from "./MessageSearch";
import { DirectMessageTab } from "../rooms/DirectMessageTab";
import { PeopleDialog } from "../rooms/PeopleDialog";
import { useMatrixRoom } from "../../hooks/matrix/useMatrixRoom";
import { useMatrixRooms } from "../../hooks/matrix/useMatrixRooms";
import { useMatrixSession } from "../../hooks/matrix/useMatrixSession";
import { WorkspaceRail } from "../rooms/WorkspaceRail";
import { RoomSidebar } from "../rooms/RoomSidebar";
import { TimelineErrorBoundary } from "../../components/common/TimelineErrorBoundary";
import { TimelinePanel } from "./TimelinePanel";
import { IdentityDialog } from "../auth/IdentityDialog";
import { useMatrixSnapshot } from "../../hooks/matrix/useMatrixSnapshot";
import { MembershipToast } from "../rooms/MembershipToast";
import { SettingsDialog } from "../settings/SettingsDialog";
import { RoomSettingsDialog } from "../settings/RoomSettingsDialog";
import { matrixNotifications } from "../../app/providers/MatrixProvider";
import { useMatrixRuntime } from "../../app/providers/MatrixProvider";
import { isVoiceRoom, spaceRoomIds } from "../../../domain/matrix/RoomNavigation";
import { ConversationCallCard } from "./ConversationCallCard";
import type { MatrixRoom } from "../../../domain/matrix/MatrixTypes";
import { CreateServerDialog } from "../rooms/CreateServerDialog";
import { VoiceChatToggle } from "./VoiceChatToggle";
import { ProfileActions } from "./ProfileActions";

export function ChatShell() {
  const [directCall, setDirectCall] = useState<DirectCallState | null>(null);
  const [callError, setCallError] = useState<string | null>(null);
  useEffect(() => directCalls.subscribe(setDirectCall), []);
  const [roomCalls, setRoomCalls] = useState<RoomCall[]>([]);
  useEffect(() => observeCalls(setRoomCalls), []);
  const [call, setCall] = useState<{ roomId: string; name: string; video: boolean } | null>(null);
  const [voiceDock, setVoiceDock] = useState<HTMLDivElement | null>(null);
  const [hiddenVoiceChats, setHiddenVoiceChats] = useState<ReadonlySet<string>>(() => new Set());
  const closeCall = useCallback(() => setCall(null), []);
  const { rooms, spaceRooms, selectedRoomId, selectRoom, closeDirectMessage } = useMatrixRooms();
  const runtime = useMatrixRuntime();
  const prefs = usePreferences();
  const hiddenChannels = useSyncExternalStore(hiddenTopChannels.subscribe, hiddenTopChannels.getSnapshot, hiddenTopChannels.getSnapshot);
  const [discovery, setDiscovery] = useState<Record<string, { pending: boolean; error?: string }>>({});
  const refreshSpace = useCallback(async (id: string) => {
    setDiscovery(state => ({ ...state, [id]: { pending: true } }));
    try { await runtime.discoverSpaceRooms(id); setDiscovery(state => ({ ...state, [id]: { pending: false } })); }
    catch (error) { setDiscovery(state => ({ ...state, [id]: { pending: false, error: error instanceof Error ? error.message : "Unable to discover channels." } })); }
  }, [runtime]);
  const spaceSignature = JSON.stringify(rooms.filter(room => room.isSpace && room.membership === "join").map(room => [room.id, room.childRoomIds]).sort());
  useEffect(() => {
    const ids = (JSON.parse(spaceSignature) as [string, string[]][]).map(([id]) => id);
    let disposed = false;
    const refresh = async () => { for (const id of ids) { if (disposed) return; await refreshSpace(id); } };
    void refresh();
    const timer = setInterval(() => void refresh(), 60_000);
    return () => { disposed = true; clearInterval(timer); };
  }, [spaceSignature, refreshSpace]);
  useEffect(() => { matrixNotifications.viewedRoom = selectedRoomId && !hiddenVoiceChats.has(selectedRoomId) ? selectedRoomId : null; return () => { matrixNotifications.viewedRoom = null; }; }, [selectedRoomId, hiddenVoiceChats]);
  useEffect(() => window.desktop?.notifications?.onOpenRoom(selectRoom), [selectRoom]);
  useEffect(() => {
    const open = (event: Event) => { const id: unknown = (event as CustomEvent).detail; if (typeof id === "string") selectRoom(id); };
    window.addEventListener("grungus:open-room", open);
    return () => window.removeEventListener("grungus:open-room", open);
  }, [selectRoom]);
  const [spaceId, setSpaceId] = useState<string | null>(null);
  const [addingPeople, setAddingPeople] = useState(false);
  const [creatingServer, setCreatingServer] = useState(false);
  const [identityOpen, setIdentityOpen] = useState(false);
  const [userVerificationOpen, setUserVerificationOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [managedRoomId, setManagedRoomId] = useState<string | null>(null);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      if (event.key === ",") { event.preventDefault(); if (!document.querySelector("dialog[open]")) setSettingsOpen(true); }
      if (event.key.toLowerCase() === "k" && !document.querySelector("dialog[open]")) { event.preventDefault(); document.querySelector<HTMLInputElement>('.room-search input')?.focus(); }
      if (event.key.toLowerCase() === "f" && !document.querySelector("dialog[open]")) { event.preventDefault(); const field = [...document.querySelectorAll<HTMLInputElement>("[data-message-search]")].filter(item => item.checkVisibility({ visibilityProperty: true })).at(-1); field?.dispatchEvent(new CustomEvent("grungus:focus-search", { detail: { scope: event.shiftKey ? "server" : "room" } })); }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);
  const { identity, presences, timelines } = useMatrixSnapshot();
  const incomingVerification = identity?.verification?.incoming && ["requested", "ready", "started"].includes(identity.verification.phase);
  const spaces = rooms.filter((candidate) => candidate.isSpace && candidate.membership === "join");
  const serverRooms = spaceRoomIds(spaces, spaceRooms);
  const directRooms = rooms.filter((candidate) => candidate.isDirect && candidate.memberCount <= 2 && !serverRooms.has(candidate.id) && !candidate.isDirectClosed && !candidate.isSpace && candidate.membership === "join");
  const channelServers = new Map(spaces.flatMap(space => [...(space.childRoomIds ?? []), ...(spaceRooms[space.id] ?? []).map(room => room.id)].map(id => [id, space] as const)));
  const topRooms = recentConversations([...directRooms, ...(prefs.showChannelsInTopBar ? rooms.filter(room => room.membership === "join" && !room.isSpace && serverRooms.has(room.id) && latestMessageTime(room, timelines) > 0 && channelTabVisible(hiddenChannels, room.id, latestMessageTime(room, timelines))) : [])], timelines);
  const activeSpace = spaces.find((candidate) => candidate.id === spaceId);
  const room = useMatrixRoom(selectedRoomId);
  const voiceRoom = room && serverRooms.has(room.id) && isVoiceRoom(room);
  const voiceChatLatestId = voiceRoom && room ? timelines[room.id]?.at(-1)?.id : undefined;
  useEffect(() => {
    if (voiceRoom && selectedRoomId) runtime.setRoomChatVisible(selectedRoomId, !hiddenVoiceChats.has(selectedRoomId));
  }, [runtime, voiceRoom, selectedRoomId, hiddenVoiceChats, voiceChatLatestId]);
  const groupRoom = room && !serverRooms.has(room.id) && (!room.isDirect || room.memberCount > 2);
  const selectedCall = roomCalls.find(call => call.roomId === room?.id);
  const otherGroupCalls = roomCalls.filter(active => !serverRooms.has(active.roomId) && active.roomId !== selectedRoomId);
  useEffect(() => {
    if (!selectedRoomId) return;
    const currentIds = spaceId ? new Set([...(spaces.find(space => space.id === spaceId)?.childRoomIds ?? []), ...(spaceRooms[spaceId] ?? []).map(room => room.id)]) : null;
    if (currentIds?.has(selectedRoomId)) return;
    const parent = spaces.find(space => space.childRoomIds?.includes(selectedRoomId) || spaceRooms[space.id]?.some(room => room.id === selectedRoomId));
    setSpaceId(parent?.id ?? null);
  }, [selectedRoomId, spaceSignature, spaceRooms]);
  const startCall = (target: MatrixRoom, video: boolean) => { if (!call && !directCall) setCall({ roomId: target.id, name: target.name, video }); };
  const selectConversation = (id: string) => { setSpaceId(null); selectRoom(id); };
  const selectSpace = (id: string | null) => {
    setSpaceId(id);
    if (id === null) { runtime.clearSelectedRoom(); return; }
    void refreshSpace(id);
    const space = spaces.find(space => space.id === id);
    const ids = id ? new Set([...(space?.childRoomIds ?? []), ...(spaceRooms[id] ?? []).map(room => room.id)]) : null;
    const next = rooms.find(room => room.membership === "join" && !room.isSpace && (ids ? ids.has(room.id) : !serverRooms.has(room.id) && !room.isDirectClosed));
    if (next) selectRoom(next.id);
    else runtime.clearSelectedRoom();
  };
  const { session, sync, error, persistenceWarning, clearError } = useMatrixSession();
  const searchableRooms = activeSpace ? [...new Map([...(spaceRooms[activeSpace.id] ?? []), ...rooms.filter(item => activeSpace.childRoomIds?.includes(item.id))].map(item => [item.id, item])).values()].filter(item => item.membership === "join" && !item.isSpace) : [];
  const renderSearch = (target: MatrixRoom | null) => <MessageSearch key={target?.id ?? "search"} room={target} serverName={activeSpace?.name} serverRooms={searchableRooms} members={[...new Map([...(target ? [target] : []), ...searchableRooms].flatMap(item => runtime.getRoomMembers(item.id)).filter(member => member.membership === "join").map(member => [member.id, member])).values()]} historyKey={JSON.stringify([session?.homeserverUrl, session?.userId, activeSpace?.id ?? target?.id])} onOpen={async message => {
        await runtime.openSearchResult(message);
        if (hiddenVoiceChats.has(message.roomId)) { const next = new Set(hiddenVoiceChats); next.delete(message.roomId); setHiddenVoiceChats(next); runtime.setRoomChatVisible(message.roomId, true); }
        requestAnimationFrame(() => requestAnimationFrame(() => window.dispatchEvent(new CustomEvent("grungus:focus-message", { detail: { roomId: message.roomId, eventId: message.id } }))));
      }} />;
  const renderTimeline = (target: MatrixRoom | null, compact = false) => <TimelineErrorBoundary key={target?.id ?? "no-room"}>
    <TimelinePanel draftKey={target && session ? JSON.stringify([session.homeserverUrl, session.userId, target.id]) : undefined} search={!compact ? renderSearch(target) : undefined} compact={compact} room={target} onOpenSettings={() => { if (target) setManagedRoomId(target.id); }} onOpenIdentity={() => setIdentityOpen(true)} onCall={video => { if (target) startCall(target, video); }} callActive={Boolean(call || directCall)} />
  </TimelineErrorBoundary>;
  const voiceCallRoom = call && serverRooms.has(call.roomId) ? rooms.find(room => room.id === call.roomId) : null;
  const voiceChat = (target: MatrixRoom) => <aside className="voice-channel-chat" aria-label={`Text chat for ${target.name}`}>{renderTimeline(target, true)}</aside>;
  const toggleVoiceChat = (roomId: string) => {
    const next = new Set(hiddenVoiceChats);
    if (next.has(roomId)) next.delete(roomId); else next.add(roomId);
    runtime.setRoomChatVisible(roomId, !next.has(roomId));
    setHiddenVoiceChats(next);
  };

  return (
    <main className="app-shell">
      <ProfileActions onVerification={() => { setUserVerificationOpen(true); setIdentityOpen(true); }} />
      <MembershipToast />
      <WorkspaceRail spaces={spaces} selectedSpaceId={spaceId} onSelectSpace={selectSpace} onCreateServer={() => setCreatingServer(true)} />
      <RoomSidebar onManageChannel={setManagedRoomId} voiceDockRef={setVoiceDock} key={spaceId ?? "home"} space={activeSpace ?? null} calls={roomCalls} callActive={Boolean(call || directCall)} onJoinVoice={room => startCall(room, false)} discoveryPending={spaceId ? discovery[spaceId]?.pending : false} discoveryError={spaceId ? discovery[spaceId]?.error : undefined} onRetryDiscovery={() => { if (spaceId) void refreshSpace(spaceId); }} onOpenIdentity={() => setIdentityOpen(true)} onOpenSettings={() => setSettingsOpen(true)} onManageSpace={() => { if (activeSpace) setManagedRoomId(activeSpace.id); }} />
      <ChatSurface activeRoomId={selectedRoomId}>
      <nav className="dm-tabs" aria-label={prefs.showChannelsInTopBar ? "Recent conversations" : "Direct messages"}>
        <div className="dm-tabs__list">
        {topRooms.map((direct) => channelServers.has(direct.id) ? (
          <div className="dm-tab-wrap" key={direct.id}><button type="button" className={`dm-tab ${selectedRoomId === direct.id ? "is-selected" : ""}`} aria-current={selectedRoomId === direct.id ? "page" : undefined} onClick={() => selectRoom(direct.id)} aria-label={`#${direct.name}, ${channelServers.get(direct.id)!.name}${direct.unreadCount ? `, ${direct.unreadCount} unread messages` : ""}`}>
            <Avatar name={channelServers.get(direct.id)!.name} url={channelServers.get(direct.id)!.avatarUrl} size="small" />
            <span><strong>#{direct.name}</strong><small>{channelServers.get(direct.id)!.name}</small></span>
            {direct.unreadCount > 0 && <b className="mention-badge">{direct.unreadCount > 99 ? "99+" : direct.unreadCount}</b>}
          </button><button type="button" className="dm-tab__close" aria-label={`Close channel ${direct.name}`} data-tooltip="Hide channel from top bar" onClick={() => { try { hiddenTopChannels.hide(direct.id, latestMessageTime(direct, timelines)); } catch (error) { setCallError(error instanceof Error ? error.message : "Could not hide channel."); } }}><X size={14} /></button></div>
        ) : (
          <DirectMessageTab key={direct.id} room={direct} selected={selectedRoomId === direct.id}
            presence={direct.directUserId ? presences[direct.directUserId] : "unknown"}
            onSelect={selectConversation} onClose={id => void closeDirectMessage(id)} />
        ))}
        {topRooms.length === 0 && <span className="dm-tabs__empty">Your direct messages will appear here</span>}
        </div>
      </nav>
      <section className="chat-workspace">
        {(identity?.available && !identity.verified || incomingVerification) && <div className="status-banner identity-banner">
          <span>{incomingVerification ? `Verification request from ${identity?.verification?.userId}` : "Verify this device to fully access your encrypted chats."}</span>
          <button type="button" onClick={() => setIdentityOpen(true)}>{incomingVerification ? "Open request" : "Verify identity"}</button>
        </div>}
        {callError && <div className="status-banner status-banner--error"><span>{callError}</span><button onClick={() => setCallError(null)}>Close</button></div>}
        {(sync.state === "error" || error || persistenceWarning) && (
          <div className={`status-banner ${sync.state === "error" || error ? "status-banner--error" : ""}`}>
            <span>
              {error ?? sync.error ?? persistenceWarning}
            </span>
            {error && <button type="button" onClick={clearError}>Dismiss</button>}
          </div>
        )}
        {!room && !spaceId ? <GrungusHome onAddPeople={() => setAddingPeople(true)} rooms={rooms} calls={roomCalls} channelServers={channelServers} onOpen={selectRoom} onJoinVoice={target => startCall(target, false)} callActive={Boolean(call || directCall)} /> : room && voiceRoom ? <div className="voice-workspace"><div className="voice-workspace__main"><div className="voice-workspace__tools">{renderSearch(room)}<VoiceChatToggle visible={!hiddenVoiceChats.has(room.id)} unreadCount={room.unreadCount} onToggle={() => toggleVoiceChat(room.id)} controls={`voice-room-chat-${room.id}`} /></div><ConversationCallCard room={room} call={selectedCall} voice disabled={Boolean(call || directCall)} onCall={video => startCall(room, video)} /></div>{call?.roomId !== room.id && <div id={`voice-room-chat-${room.id}`} className="voice-chat-slot" hidden={hiddenVoiceChats.has(room.id)}>{voiceChat(room)}</div>}</div> : <>
          {room && groupRoom && selectedCall && <ConversationCallCard room={room} call={selectedCall} disabled={Boolean(call || directCall)} onCall={video => startCall(room, video)} />}
          {renderTimeline(room)}
        </>}
      </section>
      </ChatSurface>
      {!call && !directCall && otherGroupCalls.length > 0 && <aside className="active-calls" aria-label="Group calls">{otherGroupCalls.map(active => <button key={active.roomId} onClick={() => setCall({ roomId: active.roomId, name: active.name, video: false })}><Phone size={18} /><span><strong>{active.name}</strong><small>{active.participants} in call</small></span><b>Join call</b></button>)}</aside>}
      {directCall && <DirectCallPanel key={directCall.id} call={directCall} canAnswer={!call} />}
      {call && <CallPanel {...call} search={renderSearch(rooms.find(item => item.id === call.roomId) ?? null)} mode={serverRooms.has(call.roomId) ? "voice" : "group"} dock={voiceDock} visible={selectedRoomId === call.roomId} onOpen={() => selectRoom(call.roomId)} chatVisible={!hiddenVoiceChats.has(call.roomId)} chatUnreadCount={voiceCallRoom?.unreadCount ?? 0} onToggleChat={() => toggleVoiceChat(call.roomId)} chat={voiceCallRoom ? voiceChat(voiceCallRoom) : undefined} onClose={closeCall} />}
      {creatingServer && <CreateServerDialog onClose={() => setCreatingServer(false)} onCreated={id => { runtime.clearSelectedRoom(); setSpaceId(id); void refreshSpace(id); }} />}
      {addingPeople && <PeopleDialog onClose={() => setAddingPeople(false)} />}
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} onOpenIdentity={() => setIdentityOpen(true)} onManageRoom={setManagedRoomId} />}
      {managedRoomId && <RoomSettingsDialog key={managedRoomId} roomId={managedRoomId} onClose={() => setManagedRoomId(null)} />}
      {identityOpen && <IdentityDialog userVerification={userVerificationOpen} onClose={() => { setIdentityOpen(false); setUserVerificationOpen(false); }} />}
    </main>
  );
}

