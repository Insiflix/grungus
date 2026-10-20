import { X } from "lucide-react";
import type { MatrixPresence, MatrixRoom } from "../../../domain/matrix/MatrixTypes";
import { Avatar } from "../../components/common/Avatar";
import { presenceLabels } from "../../components/common/PresenceStatus";

export function DirectMessageTab({ room, selected, presence = "unknown", onSelect, onClose }: {
  room: MatrixRoom;
  selected: boolean;
  presence?: MatrixPresence;
  onSelect: (roomId: string) => void;
  onClose: (roomId: string) => void;
}) {
  return <div className="dm-tab-wrap">
    <button type="button" className={`dm-tab ${selected ? "is-selected" : ""}`}
      title={`${room.name} — ${presenceLabels[presence]}`} aria-label={`${room.name}, ${presenceLabels[presence]}${room.unreadCount > 0 ? `, ${room.unreadCount} unread messages` : ""}`}
      aria-current={selected ? "page" : undefined} onClick={() => onSelect(room.id)}>
      <Avatar name={room.name} url={room.avatarUrl} size="small" presence={presence} />
      <span><strong>{room.name}</strong><small>{presenceLabels[presence]}{room.topic ? ` · ${room.topic}` : ""}</small></span>
      {room.unreadCount > 0 && <b className="mention-badge">{room.unreadCount > 99 ? "99+" : room.unreadCount}</b>}
    </button>
    <button type="button" className="dm-tab__close" aria-label={`Close conversation with ${room.name}`} title="Close conversation · reopen it from search" onClick={() => onClose(room.id)}><X size={14} /></button>
  </div>;
}
