import { isTheme, type Theme } from "./Themes";

export interface Preferences {
  theme: Theme;
  fontSize: number;
  compact: boolean;
  reduceMotion: boolean;
  showAvatars: boolean;
  showTimestamps: boolean;
  use24HourTime: boolean;
  groupMessages: boolean;
  showInlineMedia: boolean;
  convertEmoji: boolean;
  sendWithEnter: boolean;
  sendTyping: boolean;
  showTyping: boolean;
  sendReadReceipts: boolean;
  roomSort: "name" | "unread";
  showRoomPreviews: boolean;
  showChannelsInTopBar: boolean;
  desktopNotifications: boolean;
  notificationPreviews: boolean;
  notificationSound: boolean;
  audioInput: string;
  videoInput: string;
  audioOutput: string;
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
}

export const defaultPreferences: Readonly<Preferences> = {
  theme: "forest", fontSize: 14, compact: false, reduceMotion: false,
  showAvatars: true, showTimestamps: true, use24HourTime: false,
  groupMessages: true, showInlineMedia: true, convertEmoji: true,
  sendWithEnter: true, sendTyping: true, showTyping: true, sendReadReceipts: true,
  roomSort: "name", showRoomPreviews: true, showChannelsInTopBar: false, desktopNotifications: false,
  notificationPreviews: false, notificationSound: false,
  audioInput: "", videoInput: "", audioOutput: "",
  echoCancellation: true, noiseSuppression: true, autoGainControl: true,
};

export function parsePreferences(value: unknown): Preferences {
  const result = { ...defaultPreferences };
  if (!value || typeof value !== "object") return result;
  const raw = value as Record<string, unknown>;
  for (const key of Object.keys(result) as (keyof Preferences)[]) {
    const candidate = raw[key];
    if (typeof result[key] === "boolean" && typeof candidate === "boolean") Object.assign(result, { [key]: candidate });
  }
  if (isTheme(raw.theme)) result.theme = raw.theme;
  if (raw.roomSort === "name" || raw.roomSort === "unread") result.roomSort = raw.roomSort;
  if (typeof raw.fontSize === "number" && Number.isFinite(raw.fontSize)) result.fontSize = Math.max(12, Math.min(22, raw.fontSize));
  for (const key of ["audioInput", "videoInput", "audioOutput"] as const) if (typeof raw[key] === "string") result[key] = raw[key];
  return result;
}

class PreferenceStore {
  private account = "signed-out";
  private snapshot: Preferences = { ...defaultPreferences };
  private listeners = new Set<() => void>();
  private get key() { return `grungus.preferences.${encodeURIComponent(this.account)}`; }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  setAccount(account: string) {
    if (account === this.account) return;
    this.account = account;
    try { this.snapshot = parsePreferences(JSON.parse(localStorage.getItem(this.key) ?? "null")); }
    catch { this.snapshot = { ...defaultPreferences }; }
    this.publish();
  }
  update(patch: Partial<Preferences>) {
    const next = parsePreferences({ ...this.snapshot, ...patch });
    // Persist first: an unavailable/full store must not be presented as saved.
    localStorage.setItem(this.key, JSON.stringify(next));
    this.snapshot = next;
    this.publish();
  }
  reset() { this.update({ ...defaultPreferences }); }
  reload = () => {
    try { this.snapshot = parsePreferences(JSON.parse(localStorage.getItem(this.key) ?? "null")); this.publish(); } catch { /* Keep the last valid settings. */ }
  };
  private publish() { for (const listener of this.listeners) listener(); }
}
export const preferences = new PreferenceStore();
