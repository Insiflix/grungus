import { ThemedSelect } from "../../components/common/ThemedSelect";
import { ThemePicker } from "./ThemePicker";
import { preferences, type Preferences } from "../../../domain/settings/Preferences";
import { usePreferences } from "../../hooks/usePreferences";
import { SettingsSection, type SettingsPanelProps } from "./SettingsDialog";
import { useState, type ReactNode } from "react";
import { useQueuedSetting } from "./useQueuedSetting";

export function SettingsToggle({ title, detail, checked, disabled, pending, onChange }: { title: string; detail?: string; checked: boolean; disabled?: boolean; pending?: boolean; onChange: (value: boolean) => void }) {
  return <label className="settings-toggle"><span><strong>{title}</strong>{detail && <small>{detail}</small>}</span><input type="checkbox" role="switch" checked={checked} disabled={disabled} aria-busy={pending || undefined} onChange={(event) => onChange(event.target.checked)} /></label>;
}

export function AsyncSettingsToggle({ title, detail, checked, disabled, save }: { title: string; detail?: string; checked: boolean; disabled?: boolean; save: (value: boolean) => Promise<unknown> }) {
  const setting = useQueuedSetting(checked, save);
  return <div><SettingsToggle title={title} detail={detail} checked={setting.value} disabled={disabled} pending={setting.saving} onChange={setting.change} />{setting.error && <p className="settings-inline-error" role="alert">{setting.error}</p>}</div>;
}

export function AsyncSettingsSelect<T extends string>({ title, value, save, children }: { title: string; value: T; save: (value: T) => Promise<unknown>; children: ReactNode }) {
  const setting = useQueuedSetting(value, save);
  return <label className="settings-field">{title}<ThemedSelect value={setting.value} aria-busy={setting.saving || undefined} onChange={(event) => setting.change(event.target.value as T)}>{children}</ThemedSelect>{setting.error && <span className="settings-inline-error" role="alert">{setting.error}</span>}</label>;
}

export function usePreferenceUpdate() {
  const [error, setError] = useState<string | null>(null);
  const update = (patch: Partial<Preferences>) => {
    try { preferences.update(patch); setError(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save preferences."); }
  };
  return { update, error };
}

export function PreferenceSettings({ kind }: SettingsPanelProps & { kind: "appearance" | "preferences" }) {
  const prefs = usePreferences();
  const { update, error } = usePreferenceUpdate();
  const toggle = (key: keyof Preferences, title: string, detail?: string) => <SettingsToggle key={key} title={title} detail={detail} checked={Boolean(prefs[key])} onChange={(value) => update({ [key]: value })} />;
  return <>{error && <p className="settings-inline-error" role="alert">{error}</p>}{kind === "appearance" ? <>
    <SettingsSection title="Theme"><ThemePicker value={prefs.theme} onChange={theme => update({theme})} /></SettingsSection>
    <SettingsSection title="Messages"><label className="settings-field">Message text size <output>{prefs.fontSize}px</output><input type="range" min={12} max={22} value={prefs.fontSize} onChange={(event) => update({ fontSize: Number(event.target.value) })} /></label>{toggle("compact", "Compact layout")}{toggle("showAvatars", "Show message avatars")}{toggle("showTimestamps", "Show message timestamps")}{toggle("use24HourTime", "Use 24-hour time")}{toggle("groupMessages", "Group consecutive messages")}{toggle("reduceMotion", "Reduce animation", "System reduced-motion preferences are also respected.")}</SettingsSection>
    <SettingsSection title="Room list"><label className="settings-field">Sort rooms<ThemedSelect value={prefs.roomSort} onChange={(event) => update({ roomSort: event.target.value as Preferences["roomSort"] })}><option value="name">Alphabetical</option><option value="unread">Unread and mentions first</option></ThemedSelect></label>{toggle("showRoomPreviews", "Show room topics and member counts")}</SettingsSection>
  </> : <>
    <SettingsSection title="Composing messages">{toggle("sendWithEnter", "Send messages with Enter", "When off, use Ctrl / ⌘ + Enter to send.")}{toggle("convertEmoji", "Convert emoji shortcodes", "Turn :smile: into an emoji in messages.")}{toggle("showInlineMedia", "Display GIFs inline", "When off, GIF messages display as text URLs.")}</SettingsSection>
    <SettingsSection title="Privacy">{toggle("sendTyping", "Send typing notifications")}{toggle("showTyping", "Show other people’s typing indicators")}{toggle("sendReadReceipts", "Send read receipts", "Applies when you open a room. Previously sent receipts remain visible.")}</SettingsSection>
  </>}</>;
}
