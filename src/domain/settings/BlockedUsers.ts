class BlockedUserStore {
  private users: ReadonlySet<string> = new Set();
  private listeners = new Set<() => void>();
  getSnapshot = () => this.users;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  update(ids: string[]) {
    this.users = new Set(ids);
    for (const listener of this.listeners) listener();
  }
}
export const blockedUsers = new BlockedUserStore();
