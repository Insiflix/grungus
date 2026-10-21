import { Plus } from "lucide-react";
import { Avatar } from "../../components/common/Avatar";
import type { MatrixRoom } from "../../../domain/matrix/MatrixTypes";
import { BrandLogo } from "../../components/common/BrandLogo";

interface WorkspaceRailProps {
  spaces: MatrixRoom[];
  selectedSpaceId: string | null;
  onSelectSpace: (id: string | null) => void;
  onCreateServer: () => void;
}

export function WorkspaceRail({ spaces, selectedSpaceId, onSelectSpace, onCreateServer }: WorkspaceRailProps) {
  return (
    <nav className="workspace-rail" aria-label="Servers">
      <button type="button" className={`rail-button rail-button--brand ${selectedSpaceId === null ? "is-active" : ""}`} aria-label="Grungus home" data-tooltip="Grungus home" onClick={() => onSelectSpace(null)}><BrandLogo /></button>
      <div className="rail-divider" />
      <div className="rail-servers">
        {spaces.map((space) => (
          <button type="button" key={space.id} className={`rail-button ${selectedSpaceId === space.id ? "is-active" : ""}`} aria-label={space.name} data-tooltip={space.name} aria-pressed={selectedSpaceId === space.id} onClick={() => onSelectSpace(space.id)}>
            <Avatar name={space.name} url={space.avatarUrl} />
          </button>
        ))}
      </div>
      <button type="button" className="rail-button rail-button--create" aria-label="Create server" data-tooltip="Create server" onClick={onCreateServer}><Plus /></button>
      <div className="rail-spacer" />
      <span className="rail-caption">GRUNGUS</span>
    </nav>
  );
}
