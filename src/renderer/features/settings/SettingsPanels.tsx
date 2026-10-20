import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { PushRuleKind } from "matrix-js-sdk";
import { matrixSettings, directCalls } from "../../app/providers/MatrixProvider";
import { useMatrixSession } from "../../hooks/matrix/useMatrixSession";
import { useMatrixRooms } from "../../hooks/matrix/useMatrixRooms";
import { useMatrixRuntime } from "../../app/providers/MatrixProvider";
import { useMatrixSnapshot } from "../../hooks/matrix/useMatrixSnapshot";
import { Avatar } from "../../components/common/Avatar";
import { preferences } from "../../../domain/settings/Preferences";
import { usePreferences } from "../../hooks/usePreferences";
import { cameraConstraints, loadCameraQuality, type CameraQuality } from "../../../domain/calls/CameraQuality";
import { CameraQualitySelect } from "../chat/CameraQualitySelect";
import { SettingsSection, type SettingsPanelProps } from "./SettingsDialog";
import { AsyncSettingsSelect, AsyncSettingsToggle, SettingsToggle, usePreferenceUpdate } from "./PreferenceSettings";
import { useQueuedSetting } from "./useQueuedSetting";
import { downloadText, decryptRoomKeys, encryptRoomKeys } from "./keyFiles";
import { playNotificationSound } from "../../../infrastructure/matrix/MatrixNotifications";

function useLoad<T>(loader: () => Promise<T>) {
  const [value, setValue] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(false);
  const reload = useCallback(async () => { const result = await loader(); if (mounted.current) { setValue(result); setError(null); } return result; }, [loader]);
  useEffect(() => { mounted.current = true; void reload().catch((cause) => { if (mounted.current) setError(cause instanceof Error ? cause.message : "Unable to load settings."); }); return () => { mounted.current = false; }; }, [reload]);
  return { value, reload, error };
}
function LoadState({ error, loading, children }: { error: string | null; loading: boolean; children: ReactNode }) {
  return error ? <p className="error-banner" role="alert">{error}</p> : loading ? <p role="status">Loading…</p> : children;
}
const loadAddresses = () => matrixSettings.addresses();
const loadDevices = () => matrixSettings.devices();
const loadIgnored = () => matrixSettings.ignoredUsers();
const loadRules = () => matrixSettings.pushRules();
const loadCapabilities = () => matrixSettings.capabilities();

export function GeneralSettings({ execute, busy }: SettingsPanelProps) {
  const { session, profile, logout } = useMatrixSession();
  const [name, setName] = useState(profile?.displayName ?? "");
  const [newPassword, setNewPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [logoutOthers, setLogoutOthers] = useState(false);
  const [email, setEmail] = useState("");
  const [emailValidation, setEmailValidation] = useState<{ sid: string; secret: string } | null>(null);
  const [deactivating, setDeactivating] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [erase, setErase] = useState(false);
  const addresses = useLoad(loadAddresses);
  const capabilities = useLoad(loadCapabilities);
  const [managementUrl, setManagementUrl] = useState<string | null>(null);
  useEffect(() => { let active = true; void matrixSettings.managementUrl().then((url) => { if (active) setManagementUrl(url); }).catch(() => undefined); return () => { active = false; }; }, []);
  const openManagement = () => void execute(async () => { if (!managementUrl) return; if (window.desktop) await window.desktop.auth.openExternal(managementUrl); else window.open(managementUrl, "_blank", "noopener,noreferrer"); }, "Account management opened.");
  return <>
    <SettingsSection title="Profile">
      <div className="settings-profile"><Avatar name={profile?.displayName ?? session!.userId} url={profile?.avatarUrl} /><div><strong>{session?.userId}</strong><small>{session?.homeserverUrl}</small></div></div>
      <form className="settings-form" onSubmit={(event) => { event.preventDefault(); void execute(() => matrixSettings.profile(name)); }}><label>Display name<input value={name} onChange={(event) => setName(event.target.value)} maxLength={255} disabled={busy} /></label><button className="button button--primary" disabled={busy}>Save display name</button></form>
      <div className="settings-actions"><label className="button button--secondary settings-file">Change avatar<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void execute(() => matrixSettings.avatar(file), "Avatar updated."); }} /></label><button className="button button--secondary" disabled={busy || !profile?.avatarUrl} onClick={() => void execute(() => matrixSettings.avatar(null), "Avatar removed.")}>Remove avatar</button></div>
    </SettingsSection>
    {managementUrl && <SettingsSection title="Account management"><p>Your homeserver provides an account-management page for your login, email addresses, and password.</p><button className="button button--secondary" onClick={openManagement}>Manage account in browser</button></SettingsSection>}
    <SettingsSection title="Email addresses & phone numbers"><LoadState error={addresses.error} loading={!addresses.value}>{addresses.value?.map((address) => <div className="settings-list-row" key={`${address.medium}:${address.address}`}><span><strong>{address.address}</strong><small>{address.medium}</small></span><button className="button button--secondary" disabled={busy} onClick={() => void execute(async () => { await matrixSettings.removeAddress(address.medium, address.address); await addresses.reload(); }, "Address removed.")}>Remove</button></div>)}{addresses.value?.length === 0 && <p>No email addresses or phone numbers attached.</p>}</LoadState>
      {!managementUrl && <form className="settings-form" onSubmit={(event) => { event.preventDefault(); void execute(async (auth) => {
        if (emailValidation) { await matrixSettings.addEmail(emailValidation.sid, emailValidation.secret, auth); setEmailValidation(null); setEmail(""); await addresses.reload(); }
        else { const secret = crypto.randomUUID(); const result = await matrixSettings.requestEmail(email, secret, 1); setEmailValidation({ sid: result.sid, secret }); }
      }, emailValidation ? "Email address added." : "Check your email and open the verification link, then click Finish verification."); }}>
        <label>Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required disabled={busy || Boolean(emailValidation)} /></label>
        <div className="settings-actions"><button className="button button--secondary" disabled={busy}>{emailValidation ? "Finish verification" : "Add email address"}</button>{emailValidation && <button type="button" className="button button--secondary" disabled={busy} onClick={() => setEmailValidation(null)}>Cancel</button>}</div>
      </form>}
      {!managementUrl && <PhoneSettings execute={execute} busy={busy} reload={addresses.reload} />}
    </SettingsSection>
    {!managementUrl && <SettingsSection title="Change password"><LoadState error={capabilities.error} loading={!capabilities.value}>
      {capabilities.value?.["m.change_password"]?.enabled === false ? <p>Password changes are managed by your identity provider.</p> : <form className="settings-form" onSubmit={(event) => { event.preventDefault(); void execute(async (auth) => { if (newPassword !== repeatPassword) throw new Error("The passwords do not match."); await matrixSettings.password(newPassword, logoutOthers, auth); setNewPassword(""); setRepeatPassword(""); }, "Password changed."); }}>
        <label>New password<input type="password" autoComplete="new-password" minLength={8} required value={newPassword} disabled={busy} onChange={(event) => setNewPassword(event.target.value)} /></label>
        <label>Repeat new password<input type="password" autoComplete="new-password" required value={repeatPassword} disabled={busy} onChange={(event) => setRepeatPassword(event.target.value)} /></label>
        <SettingsToggle title="Sign out other sessions" detail="Other devices will need to sign in again." checked={logoutOthers} disabled={busy} onChange={setLogoutOthers} />
        <button className="button button--secondary" disabled={busy}>Change password</button>
      </form>}
    </LoadState></SettingsSection>}
    <SettingsSection title="Sign out"><p>Save your recovery key before signing out so you can access your encrypted messages again.</p><button className="button button--secondary" disabled={busy} onClick={() => void execute(logout, "Signed out.")}>Sign out of Grungus</button></SettingsSection>
    <SettingsSection title="Deactivate account"><p>Deactivation closes your Matrix account and signs out all sessions. This cannot be undone.</p>
      {!deactivating ? <button className="button settings-danger" disabled={busy} onClick={() => setDeactivating(true)}>Deactivate account…</button> : <form className="settings-form settings-danger-zone" onSubmit={(event) => { event.preventDefault(); void execute(async (auth) => { if (confirmation !== session?.userId) throw new Error("Enter your full Matrix ID to confirm."); await matrixSettings.deactivate(erase, auth); await logout(); }, "Account deactivated."); }}>
        <label>Type your Matrix ID to confirm<input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" required /></label>
        <SettingsToggle title="Request erasure of personal information" detail="Your homeserver will apply its data-erasure policy." checked={erase} onChange={setErase} disabled={busy} />
        <div className="settings-actions"><button className="button settings-danger" disabled={busy || confirmation !== session?.userId}>Permanently deactivate account</button><button type="button" className="button button--secondary" disabled={busy} onClick={() => setDeactivating(false)}>Cancel</button></div>
      </form>}
    </SettingsSection>
  </>;
}

export function SessionSettings({ execute, busy, onOpenIdentity }: SettingsPanelProps) {
  const { session } = useMatrixSession();
  const devices = useLoad(loadDevices);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [revoking, setRevoking] = useState<string | null>(null);
  return <SettingsSection title="Where you’re signed in"><p>End sessions you no longer use. Device names, recent activity, and IP addresses come from your homeserver.</p><button className="button button--secondary" disabled={busy} onClick={() => void execute(devices.reload, "Session list refreshed.")}>Refresh sessions</button><LoadState error={devices.error} loading={!devices.value}>{devices.value?.map((device) => <div className="settings-device" key={device.device_id}>
    <div className="settings-list-row"><span><strong>{device.display_name || device.device_id}{device.device_id === session?.deviceId && <b className="settings-badge">This session</b>}</strong><small>{device.device_id} · {device.verified === true ? "Verified" : device.verified === false ? "Not verified" : "Verification status unavailable"}</small><small>{device.last_seen_ts ? new Date(device.last_seen_ts).toLocaleString() : "No recent activity"}{device.last_seen_ip ? ` · ${device.last_seen_ip}` : ""}</small></span><div className="settings-actions"><button className="button button--secondary" disabled={busy} onClick={() => { setEditing(device.device_id); setName(device.display_name ?? ""); }}>Rename</button>{device.device_id !== session?.deviceId && <button className="button settings-danger" disabled={busy} onClick={() => setRevoking(device.device_id)}>Sign out…</button>}</div></div>
    {editing === device.device_id && <form className="settings-form" onSubmit={(event) => { event.preventDefault(); void execute(async () => { await matrixSettings.renameDevice(device.device_id, name); setEditing(null); await devices.reload(); }); }}><label>Session name<input required maxLength={255} value={name} onChange={(event) => setName(event.target.value)} /></label><div className="settings-actions"><button className="button button--primary" disabled={busy}>Save name</button><button type="button" className="button button--secondary" onClick={() => setEditing(null)}>Cancel</button></div></form>}
    {revoking === device.device_id && <div className="settings-danger-zone"><p>Sign out “{device.display_name || device.device_id}”? That device will lose access until it signs in again.</p><div className="settings-actions"><button className="button settings-danger" disabled={busy} onClick={() => void execute(async (auth) => { await matrixSettings.revokeDevice(device.device_id, auth); setRevoking(null); await devices.reload(); }, "Session signed out.")}>Confirm sign out</button><button className="button button--secondary" disabled={busy} onClick={() => setRevoking(null)}>Cancel</button></div></div>}
  </div>)}</LoadState><button className="button button--secondary" onClick={onOpenIdentity}>Verify this session</button></SettingsSection>;
}

export function SecuritySettings({ execute, busy, onOpenIdentity }: SettingsPanelProps) {
  const { identity } = useMatrixSnapshot();
  const [passphrase, setPassphrase] = useState("");
  const [file, setFile] = useState<File | null>(null);
  return <>
    <SettingsSection title="Identity & recovery"><p>{identity?.verified ? "This session is verified." : "This session has not been verified."}</p><p>{identity?.hasRecovery ? "Recovery is configured for your identity." : "Set up recovery to protect access to your encrypted messages."}</p><button className="button button--primary" onClick={onOpenIdentity}>Manage verification & recovery</button></SettingsSection>
    <SettingsSection title="Export encrypted room keys"><p>Save an encrypted copy of the message keys held by this session. The file is compatible with Matrix clients such as Element. Keep its passphrase safe.</p>
      <form className="settings-form" onSubmit={(event) => { event.preventDefault(); void execute(async () => { const encrypted = await encryptRoomKeys(await matrixSettings.exportKeys(), passphrase); downloadText(encrypted, "grungus-room-keys.txt"); setPassphrase(""); }, "Encrypted key file downloaded."); }}><label>File passphrase<input type="password" autoComplete="new-password" required minLength={8} value={passphrase} onChange={(event) => setPassphrase(event.target.value)} disabled={busy} /></label><button className="button button--secondary" disabled={busy}>Export keys</button></form>
    </SettingsSection>
    <SettingsSection title="Import encrypted room keys"><p>Import a Matrix room-key export using its file passphrase. Imported keys cannot restore messages whose keys are missing from the file.</p><form className="settings-form" onSubmit={(event) => { event.preventDefault(); if (!file) return; void execute(async () => { if (file.size > 100 * 1024 * 1024) throw new Error("Choose a key export smaller than 100 MB."); await matrixSettings.importKeys(await decryptRoomKeys(await file.text(), passphrase)); setPassphrase(""); setFile(null); }, "Room keys imported."); }}><label>Encrypted key file<input type="file" accept=".txt,.json" disabled={busy} onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label><label>File passphrase<input type="password" autoComplete="off" required value={passphrase} onChange={(event) => setPassphrase(event.target.value)} disabled={busy} /></label><button className="button button--secondary" disabled={busy || !file}>Import keys</button></form></SettingsSection>
  </>;
}

export function BlockedSettings({ execute, busy }: SettingsPanelProps) {
  const users = useLoad(loadIgnored);
  const [user, setUser] = useState("");
  return <SettingsSection title="Blocked users"><p>Your block list is stored on your Matrix account and shared with your other clients.</p><LoadState error={users.error} loading={!users.value}>{users.value?.map((id) => <div className="settings-list-row" key={id}><strong>{id}</strong><button className="button button--secondary" disabled={busy} onClick={() => void execute(async () => { await matrixSettings.setIgnored(id, false); await users.reload(); }, "User unblocked.")}>Unblock</button></div>)}{users.value?.length === 0 && <p>You haven’t blocked anyone.</p>}</LoadState><form className="settings-form" onSubmit={(event) => { event.preventDefault(); void execute(async () => { await matrixSettings.setIgnored(user.trim(), true); setUser(""); await users.reload(); }, "User blocked."); }}><label>Matrix ID<input required placeholder="@user:example.org" value={user} onChange={(event) => setUser(event.target.value)} disabled={busy} /></label><button className="button button--secondary" disabled={busy}>Block user</button></form></SettingsSection>;
}

export function NotificationSettings({ execute, busy }: SettingsPanelProps) {
  const prefs = usePreferences();
  const local = usePreferenceUpdate();
  const rules = useLoad(loadRules);
  const [keyword, setKeyword] = useState("");
  const global = rules.value?.global;
  const master = global?.override?.find((rule) => rule.rule_id === ".m.rule.master");
  const defaults = global?.underride?.filter((rule) => [".m.rule.message", ".m.rule.encrypted", ".m.rule.room_one_to_one", ".m.rule.encrypted_room_one_to_one"].includes(rule.rule_id)) ?? [];
  const enabled = defaults.filter((rule) => rule.enabled && rule.actions.includes("notify" as never)).length;
  const mode = master?.enabled ? "off" : enabled === 0 ? "mentions" : enabled === defaults.length ? "all" : "custom";
  return <>
    <EmailNotificationSettings execute={execute} busy={busy} />
    <SettingsSection title="Account notifications"><p>These rules are saved to your homeserver and affect all Matrix clients.</p><LoadState error={rules.error} loading={!rules.value}><AsyncSettingsSelect title="Notify me about" value={mode} save={async (next) => { if (next === "custom") return; await matrixSettings.setMessageNotifications(next); await rules.reload(); }}><option value="all">All messages</option><option value="mentions">Mentions and keywords</option><option value="off">Nothing</option>{mode === "custom" && <option value="custom" disabled>Custom rules from another client</option>}</AsyncSettingsSelect>
      {([ [PushRuleKind.Override, ".m.rule.is_user_mention", "Mentions of me"], [PushRuleKind.Override, ".m.rule.is_room_mention", "Room mentions"], [PushRuleKind.Underride, ".m.rule.call", "Incoming calls"], [PushRuleKind.Override, ".m.rule.invite_for_me", "Room invitations"] ] as const).map(([kind, id, title]) => { const rule = global?.[kind]?.find((rule) => rule.rule_id === id); return rule && <AsyncSettingsToggle key={id} title={title} checked={rule.enabled} disabled={mode === "off"} save={async (enabled) => { await matrixSettings.enablePushRule(kind, id, enabled); await rules.reload(); }} />; })}
    </LoadState></SettingsSection>
    <SettingsSection title="On this device">{local.error && <p className="settings-inline-error" role="alert">{local.error}</p>}<AsyncSettingsToggle title="Desktop notifications" detail="Notify when Grungus is in the background." checked={prefs.desktopNotifications} disabled={typeof Notification === "undefined"} save={async (enabled) => { if (enabled && Notification.permission !== "granted" && await Notification.requestPermission() !== "granted") throw new Error("Notification permission was not granted. Allow notifications in your browser or system settings, then try again."); preferences.update({ desktopNotifications: enabled }); }} />
      <SettingsToggle title="Show message content" detail="Allow message previews in desktop notifications." checked={prefs.notificationPreviews} onChange={(value) => local.update({ notificationPreviews: value })} />
      <SettingsToggle title="Notification sounds" checked={prefs.notificationSound} onChange={(value) => { local.update({ notificationSound: value }); if (value) void playNotificationSound().catch(() => undefined); }} />
      <button className="button button--secondary" disabled={busy} onClick={() => void execute(async () => { if (typeof Notification === "undefined" || await Notification.requestPermission() !== "granted") throw new Error("Allow notifications first."); new Notification("Grungus Matrix", { body: "Your notifications are working.", icon: "./grungus.png" }); }, "Test notification sent.")}>Send test notification</button>
    </SettingsSection>
    <SettingsSection title="Keywords"><LoadState error={rules.error} loading={!rules.value}>{global?.content?.filter((rule) => !rule.default).map((rule) => <div className="settings-list-row" key={rule.rule_id}><strong>{rule.pattern}</strong><button className="button button--secondary" disabled={busy} onClick={() => void execute(async () => { await matrixSettings.removeKeyword(rule.rule_id); await rules.reload(); }, "Keyword removed.")}>Remove</button></div>)}</LoadState><form className="settings-form" onSubmit={(event) => { event.preventDefault(); void execute(async () => { await matrixSettings.keyword(keyword); setKeyword(""); await rules.reload(); }); }}><label>Notify when a message contains<input value={keyword} onChange={(event) => setKeyword(event.target.value)} required disabled={busy} /></label><button className="button button--secondary" disabled={busy}>Add keyword</button></form></SettingsSection>
  </>;
}

function PhoneSettings({ execute, busy, reload }: Pick<SettingsPanelProps, "execute" | "busy"> & { reload: () => Promise<unknown> }) {
  const [country, setCountry] = useState("");
  const [number, setNumber] = useState("");
  const [code, setCode] = useState("");
  const [validation, setValidation] = useState<{ sid: string; secret: string; url: string; verified: boolean } | null>(null);
  return <form className="settings-form" onSubmit={(event) => { event.preventDefault(); void execute(async (auth) => {
    if (!validation) {
      const secret = crypto.randomUUID();
      const result = await matrixSettings.requestPhone(country, number, secret);
      if (!result.submit_url) throw new Error("Your homeserver did not provide an SMS verification endpoint. Manage phone numbers with your identity provider.");
      setValidation({ sid: result.sid, secret, url: result.submit_url, verified: false });
    } else {
      if (!validation.verified) { await matrixSettings.verifyPhone(validation.url, validation.sid, validation.secret, code); validation.verified = true; }
      await matrixSettings.addEmail(validation.sid, validation.secret, auth);
      setValidation(null); setCode(""); setNumber(""); await reload();
    }
  }, validation ? "Phone number added." : "SMS sent. Enter the verification code to finish."); }}>
    <label>Phone country (two-letter code)<input value={country} onChange={(event) => setCountry(event.target.value.toUpperCase())} placeholder="DE" required pattern="[A-Za-z]{2}" maxLength={2} disabled={busy || Boolean(validation)} /></label>
    <label>Phone number<input type="tel" autoComplete="tel" required value={number} onChange={(event) => setNumber(event.target.value)} disabled={busy || Boolean(validation)} /></label>
    {validation && <label>SMS verification code<input required autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value)} disabled={busy} /></label>}
    <div className="settings-actions"><button className="button button--secondary" disabled={busy}>{validation ? "Verify phone number" : "Add phone number"}</button>{validation && <button type="button" className="button button--secondary" disabled={busy} onClick={() => { setValidation(null); setCode(""); }}>Cancel</button>}</div>
  </form>;
}

const loadEmailNotifications = async () => ({ addresses: await matrixSettings.addresses(), pushers: await matrixSettings.pushers() });
function EmailNotificationSettings({ execute, busy }: Pick<SettingsPanelProps, "execute" | "busy">) {
  const email = useLoad(loadEmailNotifications);
  return <SettingsSection title="Email notifications"><LoadState error={email.error} loading={!email.value}>
    {email.value?.addresses.filter((address) => address.medium === "email").map((address) => <AsyncSettingsToggle key={address.address} title={address.address} checked={Boolean(email.value?.pushers.some((pusher) => pusher.kind === "email" && pusher.pushkey === address.address))} save={async (enabled) => { await matrixSettings.emailNotifications(address.address, enabled); await email.reload(); }} />)}
    {!email.value?.addresses.some((address) => address.medium === "email") && <p>Add a verified email address in General to receive email notifications.</p>}
  </LoadState></SettingsSection>;
}

export function VoiceSettings({ execute, busy }: SettingsPanelProps) {
  const prefs = usePreferences();
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [quality, setQuality] = useState<CameraQuality>(loadCameraQuality);
  const [preview, setPreview] = useState<MediaStream | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const previewMounted = useRef(false);
  const video = useRef<HTMLVideoElement>(null);
  const stopPreview = () => { streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null; setPreview(null); };
  useEffect(() => { previewMounted.current = true; const media = navigator.mediaDevices; const refresh = () => void media?.enumerateDevices().then(devices => { if (previewMounted.current) setDevices(devices); }).catch(() => undefined); refresh(); media?.addEventListener("devicechange", refresh); return () => { previewMounted.current = false; media?.removeEventListener("devicechange", refresh); streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null; }; }, []);
  useEffect(() => { if (video.current) video.current.srcObject = preview; }, [preview]);
  const media = useQueuedSetting({ audioInput: prefs.audioInput, videoInput: prefs.videoInput, audioOutput: prefs.audioOutput, echoCancellation: prefs.echoCancellation, noiseSuppression: prefs.noiseSuppression, autoGainControl: prefs.autoGainControl }, async (next) => {
    await matrixSettings.media(next.audioInput, next.videoInput, next);
    preferences.update(next);
  });
  const cameraQuality = useQueuedSetting(quality, async (next) => { await directCalls.setCameraQuality(next); setQuality(next); });
  const update = (patch: Partial<typeof media.value>) => media.change({ ...media.value, ...patch });
  const select = (key: "audioInput" | "videoInput" | "audioOutput", kind: MediaDeviceKind, label: string) => <label className="settings-field">{label}<select value={media.value[key]} aria-busy={media.saving || undefined} onChange={(event) => update({ [key]: event.target.value })}><option value="">System default</option>{devices.filter((device) => device.kind === kind && device.deviceId).map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `${label} ${index + 1}`}</option>)}</select></label>;
  return <>
    {media.error && <p className="settings-inline-error" role="alert">{media.error}</p>}
    <SettingsSection title="Call devices"><p>These defaults apply to classic Matrix calls. Group calls use the device controls in their embedded Element Call window.</p>{!navigator.mediaDevices && <p role="status">Camera and microphone access requires the desktop app or a secure browser context.</p>}{select("audioInput", "audioinput", "Microphone")}{select("videoInput", "videoinput", "Camera")}{typeof HTMLMediaElement.prototype.setSinkId === "function" && select("audioOutput", "audiooutput", "Speaker")}
      <div className="settings-field"><span>Camera quality</span><CameraQualitySelect value={cameraQuality.value} onChange={cameraQuality.change} />{cameraQuality.error && <p className="settings-inline-error" role="alert">{cameraQuality.error}</p>}</div>
      <button className="button button--secondary" disabled={busy} onClick={() => void execute(async () => { const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); try { setDevices(await navigator.mediaDevices.enumerateDevices()); } finally { stream.getTracks().forEach((track) => track.stop()); } }, "Device list refreshed.")}>Allow microphone & refresh devices</button>
    </SettingsSection>
    <SettingsSection title="Audio processing">{([ ["echoCancellation", "Echo cancellation"], ["noiseSuppression", "Noise suppression"], ["autoGainControl", "Automatic microphone gain"] ] as const).map(([key, title]) => <SettingsToggle key={key} title={title} checked={media.value[key]} pending={media.saving} onChange={(value) => update({ [key]: value })} />)}</SettingsSection>
    <SettingsSection title="Test devices"><div className="settings-actions"><button className="button button--secondary" disabled={busy} onClick={() => { if (preview) stopPreview(); else void execute(async () => { const stream = await navigator.mediaDevices.getUserMedia({ video: { ...cameraConstraints(quality), ...(prefs.videoInput ? { deviceId: { exact: prefs.videoInput } } : {}) }, audio: { ...(prefs.audioInput ? { deviceId: { exact: prefs.audioInput } } : {}), echoCancellation: prefs.echoCancellation, noiseSuppression: prefs.noiseSuppression, autoGainControl: prefs.autoGainControl } }); if (!previewMounted.current) { stream.getTracks().forEach(track => track.stop()); return; } streamRef.current = stream; setPreview(stream); const devices = await navigator.mediaDevices.enumerateDevices(); if (previewMounted.current) setDevices(devices); }, "Camera and microphone preview started. Your microphone is not played back."); }}>{preview ? "Stop preview" : "Preview camera & microphone"}</button><button className="button button--secondary" disabled={busy} onClick={() => void execute(async () => {
        const context = new AudioContext();
        try { const audioContext = context as AudioContext & { setSinkId?: (id: string) => Promise<void> }; if (prefs.audioOutput && audioContext.setSinkId) await audioContext.setSinkId(prefs.audioOutput); await context.resume(); const oscillator = context.createOscillator(); const gain = context.createGain(); oscillator.frequency.value = 440; gain.gain.value = .08; oscillator.connect(gain).connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + .4); await new Promise<void>((resolve) => { oscillator.onended = () => resolve(); }); } finally { await context.close(); }
      }, "Speaker test played.")}>Test speaker</button></div>{preview && <><video ref={video} className="settings-camera-preview" autoPlay playsInline muted /><p>Camera preview active. Microphone: {preview.getAudioTracks().some((track) => track.readyState === "live") ? "receiving" : "unavailable"}.</p></>}</SettingsSection>
  </>;
}

export function RoomListSettings({ execute, busy, onManageRoom }: SettingsPanelProps & { onManageRoom: (id: string) => void }) {
  const { rooms } = useMatrixRooms();
  const runtime = useMatrixRuntime();
  const [name, setName] = useState("");
  const [space, setSpace] = useState(false);
  const [encrypted, setEncrypted] = useState(true);
  const [isPublic, setPublic] = useState(false);
  return <>
    <SettingsSection title="Create a room or space"><form className="settings-form" onSubmit={(event) => { event.preventDefault(); void execute(async () => { const id = await matrixSettings.createRoom(name, space, encrypted, isPublic); await runtime.joinRoom(id); setName(""); onManageRoom(id); }, space ? "Space created." : "Room created."); }}><label>Name<input required maxLength={255} value={name} onChange={(event) => setName(event.target.value)} disabled={busy} /></label><SettingsToggle title="Create a space" detail="Spaces organize rooms and other spaces." checked={space} onChange={setSpace} disabled={busy} /><SettingsToggle title="Public" detail="Anyone can join a public room or space." checked={isPublic} onChange={setPublic} disabled={busy} />{!space && <SettingsToggle title="Enable end-to-end encryption" checked={encrypted} onChange={setEncrypted} disabled={busy} />}<button className="button button--primary" disabled={busy}>Create {space ? "space" : "room"}</button></form></SettingsSection>
    <SettingsSection title="Your rooms & spaces">{rooms.filter((room) => room.membership === "join").map((room) => <div className="settings-list-row" key={room.id}><span><strong>{room.name}</strong><small>{room.isSpace ? "Space" : "Room"} · {room.id}</small></span><button className="button button--secondary" disabled={busy} onClick={() => onManageRoom(room.id)}>Manage</button></div>)}</SettingsSection>
  </>;
}
