import { Hash as HashIcon, Plus as PlusIcon } from "lucide-react";

export function WorkspaceRail() {
  return (
    <nav className="workspace-rail" aria-label="Workspaces">
      <button className="rail-button rail-button--brand is-active" aria-label="Matrix home">
        G
      </button>
      <div className="rail-divider" />
      <button className="rail-button" aria-label="All rooms" title="All rooms">
        <HashIcon />
      </button>
      <div className="rail-spacer" />
      <button className="rail-button rail-button--muted" aria-label="Add workspace (planned)" title="Workspace organization is planned">
        <PlusIcon />
      </button>
      <span className="rail-connection" title="Connected to Matrix" />
    </nav>
  );
}

