export class HiddenTopChannels {
  private account = "signed-out";
  private snapshot: Readonly<Record<string, number>> = {};
  private listeners = new Set<() => void>();
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private get key() { return `grungus.hidden-top-channels.${encodeURIComponent(this.account)}`; }
  setAccount(account: string) {
    if (account === this.account) return;
    this.account = account;
    try {
      const raw: unknown = JSON.parse(localStorage.getItem(this.key) ?? "{}");
      this.snapshot = raw && typeof raw === "object" && !Array.isArray(raw) ? Object.fromEntries(Object.entries(raw).filter(([, value]) => typeof value === "number" && Number.isFinite(value))) : {};
    } catch { this.snapshot = {}; }
    this.publish();
  }
  hide(roomId: string, latestMessageTime: number) { this.save({ ...this.snapshot, [roomId]: latestMessageTime }); }
  reopen(roomId: string) {
    if (!Object.hasOwn(this.snapshot, roomId)) return;
    const next = { ...this.snapshot }; delete next[roomId]; this.save(next);
  }
  private save(next: Readonly<Record<string, number>>) {
    try { localStorage.setItem(this.key, JSON.stringify(next)); } catch { /* Keep the change for this session. */ }
    this.snapshot = next; this.publish();
  }
  private publish() { for (const listener of this.listeners) listener(); }
}
export const hiddenTopChannels = new HiddenTopChannels();
export function channelTabVisible(hidden: Readonly<Record<string, number>>, roomId: string, latestMessageTime: number): boolean {
  return !Object.hasOwn(hidden, roomId) || latestMessageTime > hidden[roomId];
}
