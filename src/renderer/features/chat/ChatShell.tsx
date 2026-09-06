import { useMatrixRoom } from "../../hooks/matrix/useMatrixRoom";
import { useMatrixRooms } from "../../hooks/matrix/useMatrixRooms";
import { useMatrixSession } from "../../hooks/matrix/useMatrixSession";
import { WorkspaceRail } from "../rooms/WorkspaceRail";
import { RoomSidebar } from "../rooms/RoomSidebar";
import { TimelineErrorBoundary } from "../../components/common/TimelineErrorBoundary";
import { TimelinePanel } from "./TimelinePanel";

export function ChatShell() {
  const { selectedRoomId } = useMatrixRooms();
  const room = useMatrixRoom(selectedRoomId);
  const { sync, error, persistenceWarning, clearError } = useMatrixSession();

  return (
    <main className="app-shell">
      <WorkspaceRail />
      <RoomSidebar />
      <section className="chat-workspace">
        {(sync.state === "error" || error || persistenceWarning) && (
          <div className={`status-banner ${sync.state === "error" || error ? "status-banner--error" : ""}`}>
            <span>
              {error ?? sync.error ?? persistenceWarning}
            </span>
            {error && <button type="button" onClick={clearError}>Dismiss</button>}
          </div>
        )}
        <TimelineErrorBoundary key={selectedRoomId ?? "no-room"}>
          <TimelinePanel room={room} />
        </TimelineErrorBoundary>
      </section>
    </main>
  );
}

