interface MembershipNotice { id: number; action: "join" | "leave"; kind: "room" | "space"; name: string }
let current: MembershipNotice | null = null;
let sequence = 0;
const listeners = new Set<() => void>();
export const membershipNotices = {
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  getSnapshot: () => current,
  publish(action: "join" | "leave", room: { name: string; isSpace?: boolean }) {
    current = { id: ++sequence, action, kind: room.isSpace ? "space" : "room", name: room.name };
    for (const listener of listeners) listener();
  },
  clear(id?: number) {
    if (!current || id !== undefined && current.id !== id) return;
    current = null; for (const listener of listeners) listener();
  },
};
