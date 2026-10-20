import { useState } from "react";
import { Search, X } from "lucide-react";
import type { MatrixPresence, MatrixRoomMember } from "../../../domain/matrix/MatrixTypes";
import { Avatar } from "../../components/common/Avatar";
import { presenceLabels } from "../../components/common/PresenceStatus";

const groups: MatrixPresence[] = ["online", "unavailable", "offline", "unknown"];

export function RoomMemberList({ members, onClose }: { members: MatrixRoomMember[]; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const search = query.trim().toLocaleLowerCase();
  const visible = members.filter(member => member.membership === "join" &&
    `${member.displayName} ${member.id}`.toLocaleLowerCase().includes(search));

  return <aside className="room-members" id="room-members" aria-label="Room members" onKeyDown={event => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); }
  }}>
    <header className="room-members__header"><h2>Members <span>{members.filter(member => member.membership === "join").length}</span></h2>
      <button type="button" className="icon-button" aria-label="Close member list" onClick={onClose}><X size={16} /></button></header>
    <label className="room-members__search"><Search size={15} aria-hidden="true" />
      <input type="search" aria-label="Find a room member" placeholder="Find a member" value={query} autoFocus onChange={event => setQuery(event.target.value)} /></label>
    <div className="room-members__list">
      {groups.map(presence => {
        const people = visible.filter(member => (member.presence ?? "unknown") === presence)
          .sort((left, right) => left.displayName.localeCompare(right.displayName) || left.id.localeCompare(right.id));
        if (!people.length) return null;
        return <section className="room-members__group" key={presence} aria-label={presenceLabels[presence]}>
          <h3>{presenceLabels[presence]} <span>— {people.length}</span></h3>
          <ul>{people.map(member => <li className="room-member" key={member.id} data-tooltip={`${member.id} — ${presenceLabels[presence]}`}>
            <Avatar name={member.displayName} url={member.avatarUrl} size="small" presence={presence} />
            <span><strong>{member.displayName}</strong><small>{member.id}</small><span className="sr-only">{presenceLabels[presence]}</span></span>
          </li>)}</ul>
        </section>;
      })}
      {!visible.length && <p className="room-members__empty">{search ? "No members found." : "No members loaded yet."}</p>}
    </div>
  </aside>;
}
