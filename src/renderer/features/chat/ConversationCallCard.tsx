import { Phone, Video, Volume2 } from "lucide-react";
import type { MatrixRoom } from "../../../domain/matrix/MatrixTypes";
import type { RoomCall } from "../../../domain/calls/ICallProvider";
import { Avatar } from "../../components/common/Avatar";

export function ConversationCallCard({ room, call, voice = false, disabled, onCall }: {
  room: MatrixRoom; call?: RoomCall; voice?: boolean; disabled: boolean; onCall: (video: boolean) => void;
}) {
  return <section className={`conversation-call ${voice ? "conversation-call--voice" : ""}`} aria-label={voice ? "Voice channel" : "Group call"}>
    {voice ? <Volume2 size={40} /> : <Phone size={22} />}
    <div className="conversation-call__copy"><h2>{voice ? room.name : "Group call in progress"}</h2>
      <p>{call ? `${call.participants} ${call.participants === 1 ? "person" : "people"} in ${voice ? "voice" : "the call"}` : "Join voice to hang out with your server."}</p></div>
    {!!call?.members?.length && <ul className="conversation-call__people">{call.members.map(member => <li key={member.id}><Avatar name={member.displayName} url={member.avatarUrl} size={voice ? "large" : "small"} /><span>{member.displayName}</span></li>)}</ul>}
    <div className="conversation-call__actions"><button type="button" className="button button--primary" disabled={disabled} onClick={() => onCall(false)}><Phone size={16} /> {voice ? "Join voice" : "Join call"}</button>
      {!voice && <button type="button" className="button button--secondary" disabled={disabled} onClick={() => onCall(true)}><Video size={16} /> Join with video</button>}</div>
  </section>;
}
