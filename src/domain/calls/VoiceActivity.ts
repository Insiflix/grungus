export interface VoiceMemberActivity { userId: string; name: string; speaking: boolean; screen: boolean; camera: boolean }
let snapshot: { roomId: string; members: VoiceMemberActivity[] } | null = null;
const listeners = new Set<() => void>();
export interface WatchVoiceMedia { roomId: string; userId: string; source: "screen_share" | "camera" }
const watchListeners = new Set<(request: WatchVoiceMedia) => void>();
export const voiceActivity = {
  getSnapshot: () => snapshot,
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  update(roomId: string, members: VoiceMemberActivity[]) { snapshot = { roomId, members }; listeners.forEach(listener => listener()); },
  watch(request: WatchVoiceMedia) { watchListeners.forEach(listener => listener(request)); },
  onWatch(listener: (request: WatchVoiceMedia) => void) { watchListeners.add(listener); return () => { watchListeners.delete(listener); }; },
};
