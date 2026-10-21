import { preferences } from "../../src/domain/settings/Preferences";
import { hiddenTopChannels } from "../../src/domain/settings/HiddenTopChannels";
import type { PollInput, PollSnapshot } from "../../src/domain/messaging/Polls";
import { useSyncExternalStore } from "react";
import type { MatrixRoom, MatrixMessage } from "../../src/domain/matrix/MatrixTypes";

const base = { avatarUrl: null, topic: null, unreadCount: 0, highlightCount: 0, isEncrypted: false, membership: "join" as const, memberCount: 3 };
const space: MatrixRoom = { ...base, id: "!server:example", name: "The Forest", isSpace: true, childRoomIds: ["!general", "!voice"] };
const general: MatrixRoom = { ...base, lastMessageTimestamp: 100, id: "!general", name: "general", topic: "Welcome to the forest" };
const voice: MatrixRoom = { ...base, id: "!voice", name: "Lounge", roomType: "org.matrix.msc3417.call" };
const group: MatrixRoom = { ...base, id: "!group", name: "Weekend crew", isEncrypted: true, memberCount: 4 };
const dm: MatrixRoom = { ...base, lastMessageTimestamp: 200, id: "!dm", name: "Alice", isDirect: true, memberCount: 2, directUserId: "@alice:example" };
const secondDm: MatrixRoom = { ...base, id: "!bob-dm", name: "Bob", isDirect: true, memberCount: 2, directUserId: "@bob:example", lastMessageTimestamp: 150 };
const publicChannel: MatrixRoom = { ...base, id: "!public", name: "introductions", membership: "leave", joinRule: "public", viaServers: ["example"] };
preferences.setAccount("space-navigation-fixture");
preferences.update({ showChannelsInTopBar: true });
hiddenTopChannels.setAccount("space-navigation-fixture"); hiddenTopChannels.reopen(general.id);
let snapshot = { session: { userId: "@you:example" }, rooms: [space, general, voice, group, dm, secondDm], selectedRoomId: group.id as string | null, spaceRooms: {} as Record<string, MatrixRoom[]>, timelines: {} as Record<string, MatrixMessage[]>, presences: { "@alice:example": "online" }, identity: null };
const listeners = new Set<() => void>();
function update(value: Partial<typeof snapshot>) { snapshot = { ...snapshot, ...value }; listeners.forEach(listener => listener()); }
const members = [{ id: "@alice:example", displayName: "Alice", avatarUrl: null, membership: "join" as const, isTyping: false }, { id: "@bob:example", displayName: "Bob", avatarUrl: null, membership: "join" as const, isTyping: false }];
const calls = [{ roomId: voice.id, name: voice.name, participants: 2, members }, { roomId: group.id, name: group.name, participants: 2, members }];
const pollListeners = new Set<(snapshot: PollSnapshot) => void>();
let pollState: PollSnapshot = { counts: {}, totalVoters: 0, ownAnswers: [], ended: false, canEnd: true, loading: false, incomplete: false };
const publishPoll = () => { for (const listener of pollListeners) listener(pollState); };
Object.assign(window, { navigationFixture: { populateDm: () => update({ timelines: { ...snapshot.timelines, [dm.id]: Array.from({ length: 40 }, (_, index): MatrixMessage => ({ id: 'dm-message-' + index, roomId: dm.id, sender: { id: '@alice:example', displayName: 'Alice', avatarUrl: null }, timestamp: index * 60_000, type: 'text', body: 'Message ' + index, edited: false, replyTo: null, reactions: [], sendState: 'sent', isOwn: false, isRedacted: false })) } }), incomingChannelMessage: () => update({ rooms: snapshot.rooms.map(room => room.id === general.id ? { ...room, lastMessageTimestamp: 300 } : room) }) } });
export const runtime = {
  subscribe: (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener); },
  getSnapshot: () => snapshot,
  selectRoom: (id: string) => { hiddenTopChannels.reopen(id); update({ selectedRoomId: id }); },
  getRoomMembers: () => members,
  setRoomChatVisible: () => {},
  searchUsers: async () => members,
  clearSelectedRoom: () => update({ selectedRoomId: null }),
  discoverSpaceRooms: async (id: string) => update({ spaceRooms: { ...snapshot.spaceRooms, [id]: [general, voice, publicChannel] } }),
  joinRoom: async (id: string) => { const target = snapshot.rooms.find(room => room.id === id) ?? publicChannel; update({ rooms: [...snapshot.rooms.filter(room => room.id !== id), { ...target, id, membership: "join" }], selectedRoomId: target.isSpace ? null : id }); return true; },
  closeDirectMessage: async () => true,
  createPoll: async (roomId: string, input: PollInput) => {
    const poll = { ...input, answers: input.answers.map((text, index) => ({ id: String(index), text })) };
    const message: MatrixMessage = { id: "$fixture-poll", roomId, sender: { id: "@you:example", displayName: "You", avatarUrl: null }, timestamp: Date.now(), type: "poll", body: input.question, poll, edited: false, replyTo: null, reactions: [], sendState: "sent", isOwn: true, isRedacted: false };
    pollState = { ...pollState, counts: Object.fromEntries(poll.answers.map(answer => [answer.id, 0])), totalVoters: 0, ownAnswers: [], ended: false };
    update({ timelines: { ...snapshot.timelines, [roomId]: [...(snapshot.timelines[roomId] ?? []), message] } });
    return message.id;
  },
  observePoll: (_room: string, _id: string, listener: (snapshot: PollSnapshot) => void) => { pollListeners.add(listener); listener(pollState); return () => { pollListeners.delete(listener); }; },
  votePoll: async (_room: string, _id: string, answers: string[]) => { pollState = { ...pollState, ownAnswers: answers, totalVoters: answers.length ? 1 : 0, counts: Object.fromEntries(Object.keys(pollState.counts).map(id => [id, answers.includes(id) ? 1 : 0])) }; publishPoll(); },
  endPoll: async () => { pollState = { ...pollState, ended: true }; publishPoll(); },
};
export const useMatrixRuntime = () => runtime;
export const useMatrixSnapshot = () => useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
export const useMatrixRooms = (filter = "") => ({ ...useMatrixSnapshot(), ...runtime, rooms: snapshot.rooms.filter(room => room.name.toLowerCase().includes(filter.toLowerCase())) });
export const useMatrixRoom = (id: string | null) => useMatrixSnapshot().rooms.find(room => room.id === id) ?? null;
export const useMatrixSession = () => ({ session: { userId: "@you:example" }, profile: { displayName: "You", avatarUrl: null }, sync: { state: "ready" }, clearError() {} });
export const useMatrixTimeline = (id: string) => ({ messages: useMatrixSnapshot().timelines[id] ?? [], members, typingMembers: [], loadOlder: async () => false, createPoll: (input: PollInput) => runtime.createPoll(id, input), sendMessage: async (body: string) => { const message: MatrixMessage = { id: crypto.randomUUID(), roomId: id, sender: { id: "@you:example", displayName: "You", avatarUrl: null }, timestamp: Date.now(), type: "text", body, edited: false, replyTo: null, reactions: [], sendState: "sent", isOwn: true, isRedacted: false }; update({ timelines: { ...snapshot.timelines, [id]: [...(snapshot.timelines[id] ?? []), message] } }); }, sendAttachment: async () => {}, getUploadLimit: async () => null, setTyping() {}, toggleReaction: async () => {}, editMessage: async () => {}, deleteMessage: async () => {}, togglePin: async () => {} });
export const observeCalls = (listener: (calls: unknown[]) => void) => { listener(calls); return () => {}; };
export const directCalls = { subscribe: (listener: (state: null) => void) => { listener(null); return () => {}; } };
export const matrixNotifications = { viewedRoom: null };
export const matrixSettings = { createSpaceChannel: async () => "!new", room: async () => ({}), createRoom: async (name: string) => { const server = { ...space, id: "!created-server", name, childRoomIds: [] }; update({ rooms: [...snapshot.rooms, server] }); return server.id; } };
export function mountCall(frame: HTMLIFrameElement, _roomId: string, _video: boolean, onClose: () => void, onReady: () => void, onJoined: () => void) {
  frame.srcdoc = '<body style="margin:0;display:grid;place-items:center;height:100vh;background:#102b30;color:#cde2da;font:20px system-ui"><div style="text-align:center">Alice &nbsp; · &nbsp; Bob<p style="font-size:13px">Call media preview</p></div></body>';
  onReady(); onJoined(); return { dispose() {}, hangup: async () => onClose() };
}
