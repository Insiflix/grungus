import { DirectCallPanel } from "./DirectCallPanel";
import type { DirectCallState } from "../../../domain/calls/DirectCall";
import { directCalls } from "../../app/providers/MatrixProvider";
import { observeCalls } from "../../app/providers/MatrixProvider";
import type { RoomCall } from "../../../domain/calls/ICallProvider";
import { CallPanel } from "./CallPanel";
import { useCallback, useEffect, useState } from "react";
import { Avatar } from "../../components/common/Avatar";
import { MessageCircle, UserPlus, Phone } from "lucide-react";
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

export function ChatShell() {
  const [directCall, setDirectCall] = useState<DirectCallState | null>(null);
  const [callError, setCallError] = useState<string | null>(null);
  useEffect(() => directCalls.subscribe(setDirectCall), []);
  const [roomCalls, setRoomCalls] = useState<RoomCall[]>([]);
  useEffect(() => observeCalls(setRoomCalls), []);
  const [call, setCall] = useState<{ roomId: string; name: string; video: boolean } | null>(null);
  const closeCall = useCallback(() => setCall(null), []);
  const { rooms, selectedRoomId, selectRoom } = useMatrixRooms();
  const [spaceId, setSpaceId] = useState<string | null>(null);
  const [addingPeople, setAddingPeople] = useState(false);
  const [identityOpen, setIdentityOpen] = useState(false);
  const { identity } = useMatrixSnapshot();
  const incomingVerification = identity?.verification?.incoming && ["requested", "ready", "started"].includes(identity.verification.phase);
  const spaces = rooms.filter((candidate) => candidate.isSpace && candidate.membership === "join");
  const directRooms = rooms.filter((candidate) => candidate.isDirect && !candidate.isSpace && candidate.membership === "join");
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
          <button type="button" key={direct.id} className={`dm-tab ${selectedRoomId === direct.id ? "is-selected" : ""}`}
            aria-current={selectedRoomId === direct.id ? "page" : undefined} onClick={() => selectRoom(direct.id)}>
            <Avatar name={direct.name} url={direct.avatarUrl} size="small" />
            <span><strong>{direct.name}</strong><small>{direct.topic || "Direct message"}</small></span>
            {direct.unreadCount > 0 && <b className="mention-badge">{direct.unreadCount > 99 ? "99+" : direct.unreadCount}</b>}
          </button>
        ))}
        {directRooms.length === 0 && <span className="dm-tabs__empty">Your direct messages will appear here</span>}
      </nav>
      <RoomSidebar space={activeSpace ?? null} onOpenIdentity={() => setIdentityOpen(true)} />
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
          <TimelinePanel room={room} onOpenIdentity={() => setIdentityOpen(true)} onCall={(video) => { if (room && !call) setCall({ roomId: room.id, name: room.name, video }); }} onDirectCall={(video) => { setCallError(null); void directCalls.start(room!.id, video).catch(error => setCallError(error instanceof Error ? error.message : "Anruf fehlgeschlagen")); }} callActive={Boolean(call) || Boolean(directCall)} />
        </TimelineErrorBoundary>
      </section>
      {!call && !directCall && roomCalls.length > 0 && <aside className="active-calls" aria-label="Laufende Anrufe">{roomCalls.map(active => <button key={active.roomId} onClick={() => setCall({ roomId: active.roomId, name: active.name, video: false })}><Phone size={18} /><span><strong>{active.name}</strong><small>{active.participants === 1 ? "1 Person im Anruf" : `${active.participants} Personen im Anruf`}</small></span><b>Beitreten</b></button>)}</aside>}
      {directCall && <DirectCallPanel key={directCall.id} call={directCall} canAnswer={!call} />}
      {call && <CallPanel {...call} onClose={closeCall} />}
      {addingPeople && <PeopleDialog onClose={() => setAddingPeople(false)} />}
      {identityOpen && <IdentityDialog onClose={() => setIdentityOpen(false)} />}
    </main>
  );
}

