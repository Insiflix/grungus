export interface VoiceMemberActivity { userId: string; name: string; speaking: boolean; screen: boolean; camera: boolean }
let snapshot: { roomId: string; members: VoiceMemberActivity[] } | null = null;
const listeners = new Set<() => void>();
export const voiceActivity = {
  getSnapshot: () => snapshot,
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  update(roomId: string, members: VoiceMemberActivity[]) { snapshot = { roomId, members }; listeners.forEach(listener => listener()); },
};
