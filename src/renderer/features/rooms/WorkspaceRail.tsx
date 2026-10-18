import { Hash, Leaf } from "lucide-react";
import { Avatar } from "../../components/common/Avatar";
import type { MatrixRoom } from "../../../domain/matrix/MatrixTypes";

interface WorkspaceRailProps {
  spaces: MatrixRoom[];
  selectedSpaceId: string | null;
  onSelectSpace: (id: string | null) => void;
}

export function WorkspaceRail({ spaces, selectedSpaceId, onSelectSpace }: WorkspaceRailProps) {
  return (
    <nav className="workspace-rail" aria-label="Servers">
      <button type="button" className="rail-button rail-button--brand" aria-label="Grungus home" title="Grungus home" onClick={() => onSelectSpace(null)}><Leaf /></button>
      <div className="rail-divider" />
      <button type="button" className={`rail-button ${selectedSpaceId === null ? "is-active" : ""}`} aria-label="All rooms" title="All rooms" aria-pressed={selectedSpaceId === null} onClick={() => onSelectSpace(null)}><Hash /></button>
      <div className="rail-servers">
        {spaces.map((space) => (
          <button type="button" key={space.id} className={`rail-button ${selectedSpaceId === space.id ? "is-active" : ""}`} aria-label={space.name} title={space.name} aria-pressed={selectedSpaceId === space.id} onClick={() => onSelectSpace(space.id)}>
            <Avatar name={space.name} url={space.avatarUrl} />
          </button>
        ))}
      </div>
      <div className="rail-spacer" />
      <span className="rail-caption">GRUNGUS</span>
    </nav>
  );
}
