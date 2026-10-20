import { useState } from "react";
import { ChevronDown, Hash, LockKeyhole, Volume2 } from "lucide-react";
import type { MatrixRoom } from "../../../domain/matrix/MatrixTypes";
import type { RoomCall } from "../../../domain/calls/ICallProvider";
import { canJoinChannel, isVoiceRoom } from "../../../domain/matrix/RoomNavigation";
import { Avatar } from "../../components/common/Avatar";

export function SpaceChannels({ rooms, selectedRoomId, calls, onOpen, callActive }: {
  rooms: MatrixRoom[]; selectedRoomId: string | null; calls: RoomCall[];
  onOpen: (room: MatrixRoom, voice: boolean) => Promise<void>; callActive: boolean;
}) {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const open = async (room: MatrixRoom, voice: boolean) => {
    setPending(room.id); setError(null);
    try { await onOpen(room, voice); }
    catch (error) { setError(error instanceof Error ? error.message : "Unable to open channel."); }
    finally { setPending(null); }
  };
  return <>
    {error && <p className="channel-notice" role="alert">{error}</p>}
    {[false, true].map(voice => <details className="channel-category" key={String(voice)} open>
      <summary><ChevronDown size={12} /> {voice ? "Voice channels" : "Text channels"}</summary>
      <div role="list" aria-label={voice ? "Voice channels" : "Text channels"}>
        {rooms.filter(room => isVoiceRoom(room) === voice).map(room => {
          const call = calls.find(call => call.roomId === room.id);
          const locked = !canJoinChannel(room);
          return <div key={room.id} role="listitem">
            <button type="button" className={`channel-row ${selectedRoomId === room.id ? "is-selected" : ""} ${room.unreadCount ? "has-unread" : ""}`}
              aria-current={selectedRoomId === room.id ? "page" : undefined}
              aria-label={`${voice ? "Join voice channel" : "Open text channel"} ${room.name}${locked ? ", invitation required" : ""}`}
              title={locked ? "Invitation required" : room.topic || (voice ? "Join voice" : "Open channel")}
              disabled={locked || pending !== null || (voice && callActive)} onClick={() => void open(room, voice)}>
              {locked ? <LockKeyhole /> : voice ? <Volume2 /> : <Hash />}
              <strong>{room.name}</strong>
              {pending === room.id ? <small>Joining…</small> : room.highlightCount > 0 ? <b className="mention-badge">{room.highlightCount}</b> : !voice && room.unreadCount > 0 ? <i className="unread-badge" /> : null}
              {voice && call && <small>{call.participants}</small>}
            </button>
            {voice && call && <ul className="voice-members" aria-label={`People in ${room.name}`}>
              {call.members?.map(member => <li key={member.id}><Avatar name={member.displayName} url={member.avatarUrl} size="small" /><span>{member.displayName}</span></li>)}
              {!call.members?.length && <li>{call.participants} in voice</li>}
            </ul>}
          </div>;
        })}
        {!rooms.some(room => isVoiceRoom(room) === voice) && <p className="channel-empty">No {voice ? "voice" : "text"} channels</p>}
      </div>
    </details>)}
  </>;
}
