import { Globe, Plus } from "lucide-react";
import { useState } from "react";
import { Avatar } from "../../components/common/Avatar";
import type { MatrixRoom } from "../../../domain/matrix/MatrixTypes";
import { BrandLogo } from "../../components/common/BrandLogo";

interface WorkspaceRailProps {
  spaces: MatrixRoom[];
  selectedSpaceId: string | null;
  onSelectSpace: (id: string | null) => void;
  onCreateServer: () => void;
  onExploreServers?: () => void;
}

export function WorkspaceRail({ spaces, selectedSpaceId, onSelectSpace, onCreateServer, onExploreServers }: WorkspaceRailProps) {
  const [order, setOrder] = useState<string[]>(() => {
    try { const value: unknown = JSON.parse(localStorage.getItem("grungus:server-order") || "[]"); return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : []; } catch { return []; }
  });
  const [dragged, setDragged] = useState<string | null>(null);
  const ordered = [...spaces].sort((a, b) => (order.indexOf(a.id) < 0 ? order.length : order.indexOf(a.id)) - (order.indexOf(b.id) < 0 ? order.length : order.indexOf(b.id)));
  const move = (id: string, target: string) => {
    if (id === target) return;
    const targetIndex = ordered.findIndex(space => space.id === target);
    const next = ordered.map(space => space.id).filter(item => item !== id);
    next.splice(targetIndex, 0, id);
    setOrder(next);
    try { localStorage.setItem("grungus:server-order", JSON.stringify(next)); } catch { /* Retain ordering for this session. */ }
  };
  return (
    <nav className="workspace-rail" aria-label="Servers">
      <button type="button" className={`rail-button rail-button--brand ${selectedSpaceId === null ? "is-active" : ""}`} aria-label="Grungus home" data-tooltip="Grungus home" onClick={() => onSelectSpace(null)}><BrandLogo /></button>
      <div className="rail-divider" />
      <div className="rail-servers">
        {ordered.map((space, index) => (
          <button type="button" key={space.id} draggable onDragStart={event => { setDragged(space.id); event.dataTransfer.setData("text/plain", space.id); event.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => setDragged(null)} onDragOver={event => { if (dragged) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; } }} onDrop={event => { event.preventDefault(); if (dragged) move(dragged, space.id); setDragged(null); }} onKeyDown={event => { if (event.altKey && ["ArrowUp", "ArrowDown"].includes(event.key)) { event.preventDefault(); const target = ordered[index + (event.key === "ArrowUp" ? -1 : 1)]; if (target) { if (event.key === "ArrowUp") move(space.id, target.id); else move(target.id, space.id); } } }} className={`rail-button ${selectedSpaceId === space.id ? "is-active" : ""}`} aria-label={space.name} aria-description="Drag to reorder, or use Alt and arrow keys" data-tooltip={space.name} aria-pressed={selectedSpaceId === space.id} onClick={() => onSelectSpace(space.id)}>
            <Avatar name={space.name} url={space.avatarUrl} />
          </button>
        ))}
      </div>
      <button type="button" className="rail-button rail-button--create" aria-label="Create server" data-tooltip="Create server" onClick={onCreateServer}><Plus /></button>
      <button type="button" className="rail-button" aria-label="Explore Matrix servers" data-tooltip="Join rooms on other Matrix instances" onClick={onExploreServers}><Globe /></button>
      <div className="rail-spacer" />
      <span className="rail-caption">GRUNGUS</span>
    </nav>
  );
}
