import { useEffect, useRef, useState, type ReactNode } from "react";
import { X, Search, UserRound, Palette, Bell, SlidersHorizontal, ShieldCheck, Laptop, Mic, Keyboard, Info, UsersRound } from "lucide-react";
import { type AuthDict } from "matrix-js-sdk";
import { SettingsAuthRequired, type SettingsAuthentication } from "../../../infrastructure/matrix/MatrixSettings";
import { matrixSettings } from "../../app/providers/MatrixProvider";
import { useMatrixSession } from "../../hooks/matrix/useMatrixSession";
import { GeneralSettings, SessionSettings, SecuritySettings, NotificationSettings, VoiceSettings, BlockedSettings, RoomListSettings } from "./SettingsPanels";
import { PreferenceSettings } from "./PreferenceSettings";

export type ExecuteSettings = (action: (auth?: AuthDict) => Promise<unknown>, success?: string, auth?: AuthDict) => Promise<boolean>;
export interface SettingsPanelProps { execute: ExecuteSettings; busy: boolean; onOpenIdentity: () => void }
const tabs = [
  { id: "general", name: "General", hint: "profile avatar account password email deactivate", icon: UserRound },
  { id: "appearance", name: "Appearance", hint: "theme font size compact avatars motion timestamps", icon: Palette },
  { id: "notifications", name: "Notifications", hint: "desktop sound mentions keywords push rules", icon: Bell },
  { id: "preferences", name: "Preferences", hint: "chat typing read receipts emoji media enter", icon: SlidersHorizontal },
  { id: "sessions", name: "Sessions", hint: "devices sign out rename revoke", icon: Laptop },
  { id: "security", name: "Security & privacy", hint: "encryption recovery backup keys verification", icon: ShieldCheck },
  { id: "blocked", name: "Blocked users", hint: "ignore unblock people", icon: UsersRound },
  { id: "voice", name: "Voice & video", hint: "microphone camera speaker noise echo", icon: Mic },
  { id: "rooms", name: "Rooms & spaces", hint: "create manage administration members permissions", icon: UsersRound },
  { id: "keyboard", name: "Keyboard", hint: "shortcuts navigation", icon: Keyboard },
  { id: "about", name: "Help & about", hint: "version diagnostics sync server", icon: Info },
] as const;
type Tab = typeof tabs[number]["id"];

export function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  return <section className="settings-section"><h3>{title}</h3>{children}</section>;
}

export function SettingsDialog({ onClose, onOpenIdentity, onManageRoom }: { onClose: () => void; onOpenIdentity: () => void; onManageRoom: (id: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const { session, sync } = useMatrixSession();
  const [tab, setTab] = useState<Tab>("general");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<SettingsAuthentication | null>(null);
  const pending = useRef<{ action: (auth?: AuthDict) => Promise<unknown>; success: string } | null>(null);
  const [password, setPassword] = useState("");
  const [authStage, setAuthStage] = useState("");
  useEffect(() => { const el = dialog.current; el?.showModal(); return () => { pending.current = null; el?.close(); }; }, []);

  const execute: ExecuteSettings = async (action, success = "Changes saved.", auth) => {
    if (lock.current) return false;
    lock.current = true; setBusy(true); setError(null); setNotice(null);
    try {
      await action(auth); pending.current = null; setChallenge(null); setPassword(""); setNotice(success); return true;
    } catch (cause) {
      if (cause instanceof SettingsAuthRequired) {
        pending.current = { action, success };
        setChallenge(cause.challenge);
        const flow = cause.challenge.flows.find((flow) => flow.stages.includes("m.login.password")) ?? cause.challenge.flows[0];
        setAuthStage(flow?.stages.find((stage) => !cause.challenge.completed?.includes(stage)) ?? "m.login.password");
      } else setError(cause instanceof Error ? cause.message : "The change failed.");
      return false;
    } finally { lock.current = false; setBusy(false); }
  };
  const close = () => { if (!lock.current) onClose(); };
  const matching = tabs.filter((item) => `${item.name} ${item.hint}`.toLowerCase().includes(query.toLowerCase()));
  const panelProps = { execute, busy, onOpenIdentity };
  const active = tabs.find((item) => item.id === tab)!;
  return <dialog ref={dialog} className="settings-dialog" aria-labelledby="settings-title" onCancel={(event) => { event.preventDefault(); close(); }}>
    <header className="settings-header"><div><span className="eyebrow">MAKE YOURSELF AT HOME</span><h2 id="settings-title">Settings</h2></div><span className="settings-save-status" role="status" data-tooltip={notice ?? undefined}>{busy ? "Saving…" : notice ?? ""}</span><button className="icon-button" aria-label="Close settings" disabled={busy} onClick={close}><X /></button></header>
    <div className="settings-layout">
      <nav className="settings-nav" aria-label="Settings categories">
        <label className="settings-search"><Search size={16} /><input aria-label="Search settings" placeholder="Search settings" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        {matching.map(({ id, name, icon: Icon }) => <button key={id} disabled={busy || Boolean(challenge)} aria-current={tab === id ? "page" : undefined} onClick={() => { setTab(id); setError(null); setNotice(null); }}><Icon size={17} />{name}</button>)}
        {!matching.length && <p>No matching categories.</p>}
        <small className="settings-account">{session?.userId}</small>
      </nav>
      <div className="settings-content" aria-busy={busy}>
        <h2>{active.name}</h2>
        {error && <p className="error-banner" role="alert">{error}</p>}
        {challenge ? <section className="settings-section">
          <h3>Confirm with your homeserver</h3>
          <p>This action requires account authentication.</p>
          <form className="settings-form" onSubmit={(event) => {
            event.preventDefault(); const operation = pending.current; if (!operation) return;
            const auth: AuthDict = authStage === "m.login.password"
              ? { type: authStage, session: challenge.session, identifier: { type: "m.id.user", user: session!.userId }, password }
              : authStage === "m.login.dummy" ? { type: authStage, session: challenge.session } : { session: challenge.session };
            setPassword(""); void execute(operation.action, operation.success, auth);
          }}>
            {authStage === "m.login.password" ? <label>Current password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label> : authStage === "m.login.dummy" ? <p>Continue to confirm this change.</p> : <>
              <p>Complete the server’s authentication page, then return here and continue.</p>
              <button type="button" className="button button--secondary" onClick={() => { void (async () => {
                const url = `${session!.homeserverUrl.replace(/\/$/, "")}/_matrix/client/v3/auth/${encodeURIComponent(authStage)}/fallback/web?session=${encodeURIComponent(challenge.session ?? "")}`;
                if (window.desktop) await window.desktop.auth.openExternal(url); else window.open(url, "_blank", "noopener,noreferrer");
              })().catch((cause) => setError(cause instanceof Error ? cause.message : "Unable to open authentication.")); }}>Open authentication</button>
            </>}
            <div className="settings-actions"><button className="button button--primary" disabled={busy}>Continue</button><button type="button" className="button button--secondary" disabled={busy} onClick={() => { pending.current = null; setChallenge(null); setPassword(""); }}>Cancel</button></div>
          </form>
        </section> : <div key={tab}>
          {tab === "general" && <GeneralSettings {...panelProps} />}
          {(tab === "appearance" || tab === "preferences") && <PreferenceSettings kind={tab} {...panelProps} />}
          {tab === "notifications" && <NotificationSettings {...panelProps} />}
          {tab === "sessions" && <SessionSettings {...panelProps} />}
          {tab === "security" && <SecuritySettings {...panelProps} />}
          {tab === "blocked" && <BlockedSettings {...panelProps} />}
          {tab === "voice" && <VoiceSettings {...panelProps} />}
          {tab === "rooms" && <RoomListSettings {...panelProps} onManageRoom={onManageRoom} />}
          {tab === "keyboard" && <SettingsSection title="Keyboard shortcuts"><dl className="settings-shortcuts"><dt>Open settings</dt><dd>Ctrl / ⌘ + ,</dd><dt>Find a room</dt><dd>Ctrl / ⌘ + K</dd><dt>Close a dialog</dt><dd>Escape</dd><dt>Send message</dt><dd>Enter, or Ctrl / ⌘ + Enter when configured</dd><dt>New line</dt><dd>Shift + Enter</dd><dt>Emoji suggestions</dt><dd>Type : then use ↑ / ↓ and Enter or Tab</dd></dl></SettingsSection>}
          {tab === "about" && <>
            <SettingsSection title="Grungus Matrix"><p>A Matrix client for your corner of the forest.</p><dl className="settings-shortcuts"><dt>Version</dt><dd>{__APP_VERSION__}</dd><dt>Homeserver</dt><dd>{session?.homeserverUrl}</dd><dt>Matrix ID</dt><dd>{session?.userId}</dd><dt>Device</dt><dd>{session?.deviceId}</dd><dt>Connection</dt><dd>{sync.state}</dd></dl></SettingsSection>
            <SettingsSection title="Connection & diagnostics"><button className="button button--secondary" disabled={busy} onClick={() => void execute(async () => { if (!matrixSettings.retrySync()) throw new Error("Sync is already running; no retry is needed."); }, "Reconnecting…")}>Retry connection</button><button className="button button--secondary" onClick={() => void execute(() => navigator.clipboard.writeText(JSON.stringify({ version: __APP_VERSION__, homeserver: session?.homeserverUrl, deviceId: session?.deviceId, sync: sync.state, platform: window.desktop?.platform ?? navigator.platform }, null, 2)), "Diagnostics copied. No access tokens or message content included.")}>Copy diagnostics</button></SettingsSection>
          </>}
        </div>}
      </div>
    </div>
  </dialog>;
}
