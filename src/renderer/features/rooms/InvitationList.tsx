import { useState } from "react";
import type { MatrixRoom } from "../../../domain/matrix/MatrixTypes";
import { useMatrixRooms } from "../../hooks/matrix/useMatrixRooms";
import { Avatar } from "../../components/common/Avatar";

function Invitation({ room }: { room: MatrixRoom }) {
  const { joinRoom, declineInvite } = useMatrixRooms();
  const [busy, setBusy] = useState(false);
  const respond = async (accept: boolean) => {
    setBusy(true);
    try { await (accept ? joinRoom(room.id) : declineInvite(room.id)); }
    finally { setBusy(false); }
  };
  return (
    <article className="invitation-card" aria-label={`Invitation to ${room.name}`}>
      <div><Avatar name={room.name} url={room.avatarUrl} size="small" /><strong>{room.name}</strong></div>
      <small>{room.isDirect ? "Direct message invitation" : room.isSpace ? "Server invitation" : "Room invitation"}</small>
      <div className="invitation-actions">
        <button type="button" className="button button--compact" disabled={busy} onClick={() => void respond(true)}>Accept</button>
        <button type="button" className="button button--secondary button--compact" disabled={busy} onClick={() => void respond(false)}>Decline</button>
      </div>
    </article>
  );
}

export function InvitationList() {
  const { rooms } = useMatrixRooms();
  const invitations = rooms.filter((room) => room.membership === "invite");
  if (!invitations.length) return null;
  return <section className="invitation-list" aria-label="Pending invitations">
    <div className="room-section-label"><span>Invitations</span><span>{invitations.length}</span></div>
    {invitations.map((room) => <Invitation key={room.id} room={room} />)}
  </section>;
}
