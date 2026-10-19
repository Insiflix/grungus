import { DirectCallPanel } from "./DirectCallPanel";
import type { DirectCallState } from "../../../domain/calls/DirectCall";
import { directCalls } from "../../app/providers/MatrixProvider";
import { observeCalls } from "../../app/providers/MatrixProvider";
import type { RoomCall } from "../../../domain/calls/ICallProvider";
import { CallPanel } from "./CallPanel";
import { useCallback, useEffect, useState } from "react";
import { Avatar } from "../../components/common/Avatar";
import { MessageCircle, UserPlus, Phone, X } from "lucide-react";
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

export function ChatShell() {
  const [directCall, setDirectCall] = useState<DirectCallState | null>(null);
  const [callError, setCallError] = useState<string | null>(null);
  useEffect(() => directCalls.subscribe(setDirectCall), []);
  const [roomCalls, setRoomCalls] = useState<RoomCall[]>([]);
  useEffect(() => observeCalls(setRoomCalls), []);
  const [call, setCall] = useState<{ roomId: string; name: string; video: boolean } | null>(null);
  const closeCall = useCallback(() => setCall(null), []);
  const { rooms, selectedRoomId, selectRoom, closeDirectMessage } = useMatrixRooms();
  useEffect(() => { matrixNotifications.viewedRoom = selectedRoomId; return () => { matrixNotifications.viewedRoom = null; }; }, [selectedRoomId]);
  useEffect(() => {
    const open = (event: Event) => { const id: unknown = (event as CustomEvent).detail; if (typeof id === "string") selectRoom(id); };
    window.addEventListener("grungus:open-room", open);
    return () => window.removeEventListener("grungus:open-room", open);
  }, [selectRoom]);
  const [spaceId, setSpaceId] = useState<string | null>(null);
  const [addingPeople, setAddingPeople] = useState(false);
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
  const { identity } = useMatrixSnapshot();
  const incomingVerification = identity?.verification?.incoming && ["requested", "ready", "started"].includes(identity.verification.phase);
  const spaces = rooms.filter((candidate) => candidate.isSpace && candidate.membership === "join");
  const directRooms = rooms.filter((candidate) => candidate.isDirect && !candidate.isDirectClosed && !candidate.isSpace && candidate.membership === "join");
  const activeSpace = spaces.find((candidate) => candidate.id === spaceId);
  const room = useMatrixRoom(selectedRoomId);
  const { sync, error, persistenceWarning, clearError } = useMatrixSession();

  return (
    <main className="app-shell">
      <WorkspaceRail spaces={spaces} selectedSpaceId={spaceId} onSelectSpace={setSpaceId} />
      <nav className="dm-tabs" aria-label="Direct messages">
        <span className="dm-tabs__label"><MessageCircle /> Direct messages</span>
        <button type="button" className="dm-add-button" onClick={() => setAddingPeople(true)}><UserPlus size={16} /> Add people</button>
        {directRooms.map((direct) => (
          <div className="dm-tab-wrap" key={direct.id}>
          <button type="button" className={`dm-tab ${selectedRoomId === direct.id ? "is-selected" : ""}`}
            aria-current={selectedRoomId === direct.id ? "page" : undefined} onClick={() => selectRoom(direct.id)}>
            <Avatar name={direct.name} url={direct.avatarUrl} size="small" />
            <span><strong>{direct.name}</strong><small>{direct.topic || "Direct message"}</small></span>
            {direct.unreadCount > 0 && <b className="mention-badge">{direct.unreadCount > 99 ? "99+" : direct.unreadCount}</b>}
          </button>
          <button type="button" className="dm-tab__close" aria-label={`Close conversation with ${direct.name}`} title="Close conversation · reopen it from search" onClick={() => void closeDirectMessage(direct.id)}><X size={14} /></button>
          </div>
        ))}
        {directRooms.length === 0 && <span className="dm-tabs__empty">Your direct messages will appear here</span>}
      </nav>
      <RoomSidebar space={activeSpace ?? null} onOpenIdentity={() => setIdentityOpen(true)} onOpenSettings={() => setSettingsOpen(true)} onManageSpace={() => { if (activeSpace) setManagedRoomId(activeSpace.id); }} />
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
        <TimelineErrorBoundary key={selectedRoomId ?? "no-room"}>
          <TimelinePanel room={room} onOpenSettings={() => { if (room) setManagedRoomId(room.id); }} onOpenIdentity={() => setIdentityOpen(true)} onCall={(video) => { if (room && !call) setCall({ roomId: room.id, name: room.name, video }); }} onDirectCall={(video) => { setCallError(null); void directCalls.start(room!.id, video).catch(error => setCallError(error instanceof Error ? error.message : "Anruf fehlgeschlagen")); }} callActive={Boolean(call) || Boolean(directCall)} />
        </TimelineErrorBoundary>
      </section>
      {!call && !directCall && roomCalls.length > 0 && <aside className="active-calls" aria-label="Laufende Anrufe">{roomCalls.map(active => <button key={active.roomId} onClick={() => setCall({ roomId: active.roomId, name: active.name, video: false })}><Phone size={18} /><span><strong>{active.name}</strong><small>{active.participants === 1 ? "1 Person im Anruf" : `${active.participants} Personen im Anruf`}</small></span><b>Beitreten</b></button>)}</aside>}
      {directCall && <DirectCallPanel key={directCall.id} call={directCall} canAnswer={!call} />}
      {call && <CallPanel {...call} onClose={closeCall} />}
      {addingPeople && <PeopleDialog onClose={() => setAddingPeople(false)} />}
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} onOpenIdentity={() => setIdentityOpen(true)} onManageRoom={setManagedRoomId} />}
      {managedRoomId && <RoomSettingsDialog key={managedRoomId} roomId={managedRoomId} onClose={() => setManagedRoomId(null)} />}
      {identityOpen && <IdentityDialog onClose={() => setIdentityOpen(false)} />}
    </main>
  );
}

