export type ParticipantAudioSettings = { volume: number; muted: boolean };
type Apply = (userId: string, settings: ParticipantAudioSettings) => Promise<void>;
const defaults: ParticipantAudioSettings = { volume: 100, muted: false };
const settings = new Map<string, ParticipantAudioSettings>();
const bridges = new Map<string, Apply>();
const listeners = new Set<() => void>();
let revision = 0;
const publish = () => { revision++; listeners.forEach(listener => listener()); };
export const participantAudio = {
  subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  getSnapshot: () => revision,
  get: (roomId: string, userId: string) => settings.get(JSON.stringify([roomId, userId])) ?? defaults,
  connected: (roomId: string) => bridges.has(roomId),
  async set(roomId: string, userId: string, next: ParticipantAudioSettings) {
    const apply = bridges.get(roomId);
    if (!apply) throw new Error("Join this voice channel to adjust a user's audio.");
    const value = { volume: Math.max(0, Math.min(200, next.volume)), muted: next.muted };
    await apply(userId, value);
    settings.set(JSON.stringify([roomId, userId]), value); publish();
  },
  register(roomId: string, apply: Apply) {
    bridges.set(roomId, apply); publish();
    for (const [key, value] of settings) { const [room, user] = JSON.parse(key) as string[]; if (room === roomId) void apply(user, value).catch(() => {}); }
    return () => { if (bridges.get(roomId) === apply) { bridges.delete(roomId); publish(); } };
  },
};
