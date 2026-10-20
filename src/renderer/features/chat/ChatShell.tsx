import { DirectCallPanel } from "./DirectCallPanel";
import type { DirectCallState } from "../../../domain/calls/DirectCall";
import { directCalls } from "../../app/providers/MatrixProvider";
import { observeCalls } from "../../app/providers/MatrixProvider";
import type { RoomCall } from "../../../domain/calls/ICallProvider";
import { CallPanel } from "./CallPanel";
import { useCallback, useEffect, useState } from "react";
import { MessageCircle, UserPlus, Phone } from "lucide-react";
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
import { SettingsDialog } from "../settings/SettingsDialog";
import { RoomSettingsDialog } from "../settings/RoomSettingsDialog";
import { matrixNotifications } from "../../app/providers/MatrixProvider";
import { useMatrixRuntime } from "../../app/providers/MatrixProvider";
import { isVoiceRoom, spaceRoomIds } from "../../../domain/matrix/RoomNavigation";
import { ConversationCallCard } from "./ConversationCallCard";
import type { MatrixRoom } from "../../../domain/matrix/MatrixTypes";
import { CreateServerDialog } from "../rooms/CreateServerDialog";

export function ChatShell() {
  const [directCall, setDirectCall] = useState<DirectCallState | null>(null);
  const [callError, setCallError] = useState<string | null>(null);
  useEffect(() => directCalls.subscribe(setDirectCall), []);
  const [roomCalls, setRoomCalls] = useState<RoomCall[]>([]);
  useEffect(() => observeCalls(setRoomCalls), []);
  const [call, setCall] = useState<{ roomId: string; name: string; video: boolean } | null>(null);
  const closeCall = useCallback(() => setCall(null), []);
  const { rooms, spaceRooms, selectedRoomId, selectRoom, closeDirectMessage } = useMatrixRooms();
  const runtime = useMatrixRuntime();
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
  useEffect(() => { matrixNotifications.viewedRoom = selectedRoomId; return () => { matrixNotifications.viewedRoom = null; }; }, [selectedRoomId]);
  useEffect(() => {
    const open = (event: Event) => { const id: unknown = (event as CustomEvent).detail; if (typeof id === "string") selectRoom(id); };
    window.addEventListener("grungus:open-room", open);
    return () => window.removeEventListener("grungus:open-room", open);
  }, [selectRoom]);
  const [spaceId, setSpaceId] = useState<string | null>(null);
  const [addingPeople, setAddingPeople] = useState(false);
  const [creatingServer, setCreatingServer] = useState(false);
  const [identityOpen, setIdentityOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [managedRoomId, setManagedRoomId] = useState<string | null>(null);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      if (event.key === ",") { event.preventDefault(); if (!document.querySelector("dialog[open]")) setSettingsOpen(true); }
      if (event.key.toLowerCase() === "k" && !document.querySelector("dialog[open]")) { event.preventDefault(); document.querySelector<HTMLInputElement>('.room-search input')?.focus(); }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);
  const { identity, presences } = useMatrixSnapshot();
  const incomingVerification = identity?.verification?.incoming && ["requested", "ready", "started"].includes(identity.verification.phase);
  const spaces = rooms.filter((candidate) => candidate.isSpace && candidate.membership === "join");
  const serverRooms = spaceRoomIds(spaces, spaceRooms);
  const directRooms = rooms.filter((candidate) => candidate.isDirect && candidate.memberCount <= 2 && !serverRooms.has(candidate.id) && !candidate.isDirectClosed && !candidate.isSpace && candidate.membership === "join");
  const activeSpace = spaces.find((candidate) => candidate.id === spaceId);
  const room = useMatrixRoom(selectedRoomId);
  const voiceRoom = room && serverRooms.has(room.id) && isVoiceRoom(room);
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
    const space = spaces.find(space => space.id === id);
    const ids = id ? new Set([...(space?.childRoomIds ?? []), ...(spaceRooms[id] ?? []).map(room => room.id)]) : null;
    const next = rooms.find(room => room.membership === "join" && !room.isSpace && (ids ? ids.has(room.id) : !serverRooms.has(room.id) && !room.isDirectClosed));
    if (next) selectRoom(next.id);
    else runtime.clearSelectedRoom();
  };
  const { sync, error, persistenceWarning, clearError } = useMatrixSession();
  const renderTimeline = (target: MatrixRoom | null, compact = false) => <TimelineErrorBoundary key={target?.id ?? "no-room"}>
    <TimelinePanel compact={compact} room={target} onOpenSettings={() => { if (target) setManagedRoomId(target.id); }} onOpenIdentity={() => setIdentityOpen(true)} onCall={video => { if (target) startCall(target, video); }} onDirectCall={video => { if (target) { setCallError(null); void directCalls.start(target.id, video).catch(error => setCallError(error instanceof Error ? error.message : "Call failed.")); } }} callActive={Boolean(call || directCall)} />
  </TimelineErrorBoundary>;
  const voiceCallRoom = call && serverRooms.has(call.roomId) ? rooms.find(room => room.id === call.roomId) : null;
  const voiceChat = (target: MatrixRoom) => <aside className="voice-channel-chat" aria-label={`Text chat for ${target.name}`}>{renderTimeline(target, true)}</aside>;

  return (
    <main className="app-shell">
      <WorkspaceRail spaces={spaces} selectedSpaceId={spaceId} onSelectSpace={selectSpace} onCreateServer={() => setCreatingServer(true)} />
      <nav className="dm-tabs" aria-label="Direct messages">
        <div className="dm-tabs__tools">
        <span className="dm-tabs__label"><MessageCircle /><span>Direct messages</span></span>
        <button type="button" className="dm-add-button" onClick={() => setAddingPeople(true)}><UserPlus size={16} /> Add people</button>
        </div>
        <div className="dm-tabs__list">
        {directRooms.map((direct) => (
          <DirectMessageTab key={direct.id} room={direct} selected={selectedRoomId === direct.id}
            presence={direct.directUserId ? presences[direct.directUserId] : "unknown"}
            onSelect={selectConversation} onClose={id => void closeDirectMessage(id)} />
        ))}
        {directRooms.length === 0 && <span className="dm-tabs__empty">Your direct messages will appear here</span>}
        </div>
      </nav>
      <RoomSidebar key={spaceId ?? "home"} space={activeSpace ?? null} calls={roomCalls} callActive={Boolean(call || directCall)} onJoinVoice={room => startCall(room, false)} discoveryPending={spaceId ? discovery[spaceId]?.pending : false} discoveryError={spaceId ? discovery[spaceId]?.error : undefined} onRetryDiscovery={() => { if (spaceId) void refreshSpace(spaceId); }} onOpenIdentity={() => setIdentityOpen(true)} onOpenSettings={() => setSettingsOpen(true)} onManageSpace={() => { if (activeSpace) setManagedRoomId(activeSpace.id); }} />
      <section className="chat-workspace">
        {(identity?.available && !identity.verified || incomingVerification) && <div className="status-banner identity-banner">
          <span>{incomingVerification ? `Bestätigungsanfrage von ${identity?.verification?.userId}` : "Bestätige dieses Gerät, um deine verschlüsselten Chats vollständig zu nutzen."}</span>
          <button type="button" onClick={() => setIdentityOpen(true)}>{incomingVerification ? "Anfrage öffnen" : "Identität bestätigen"}</button>
        </div>}
        {callError && <div className="status-banner status-banner--error"><span>{callError}</span><button onClick={() => setCallError(null)}>Schließen</button></div>}
        {(sync.state === "error" || error || persistenceWarning) && (
          <div className={`status-banner ${sync.state === "error" || error ? "status-banner--error" : ""}`}>
            <span>
              {error ?? sync.error ?? persistenceWarning}
            </span>
            {error && <button type="button" onClick={clearError}>Dismiss</button>}
          </div>
        )}
        {room && voiceRoom ? <div className="voice-workspace"><ConversationCallCard room={room} call={selectedCall} voice disabled={Boolean(call || directCall)} onCall={video => startCall(room, video)} />{call?.roomId !== room.id && voiceChat(room)}</div> : <>
          {room && groupRoom && selectedCall && <ConversationCallCard room={room} call={selectedCall} disabled={Boolean(call || directCall)} onCall={video => startCall(room, video)} />}
          {renderTimeline(room)}
        </>}
      </section>
      {!call && !directCall && otherGroupCalls.length > 0 && <aside className="active-calls" aria-label="Group calls">{otherGroupCalls.map(active => <button key={active.roomId} onClick={() => setCall({ roomId: active.roomId, name: active.name, video: false })}><Phone size={18} /><span><strong>{active.name}</strong><small>{active.participants} in call</small></span><b>Join call</b></button>)}</aside>}
      {directCall && <DirectCallPanel key={directCall.id} call={directCall} canAnswer={!call} />}
      {call && <CallPanel {...call} mode={serverRooms.has(call.roomId) ? "voice" : "group"} chat={voiceCallRoom ? voiceChat(voiceCallRoom) : undefined} onClose={closeCall} />}
      {creatingServer && <CreateServerDialog onClose={() => setCreatingServer(false)} onCreated={id => { runtime.clearSelectedRoom(); setSpaceId(id); void refreshSpace(id); }} />}
      {addingPeople && <PeopleDialog onClose={() => setAddingPeople(false)} />}
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} onOpenIdentity={() => setIdentityOpen(true)} onManageRoom={setManagedRoomId} />}
      {managedRoomId && <RoomSettingsDialog key={managedRoomId} roomId={managedRoomId} onClose={() => setManagedRoomId(null)} />}
      {identityOpen && <IdentityDialog onClose={() => setIdentityOpen(false)} />}
    </main>
  );
}

