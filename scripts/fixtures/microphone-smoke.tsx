import { createRoot } from "react-dom/client";
import { VoiceSettings } from "../../src/renderer/features/settings/SettingsPanels";
import "../../src/renderer/styles/index.css";

createRoot(document.getElementById("root")!).render(<main className="settings-content" style={{ width: 760, margin: "24px auto", padding: 24 }}><h1>Voice & video</h1><VoiceSettings busy={false} onOpenIdentity={() => {}} execute={async action => { await action(); return true; }} /></main>);
