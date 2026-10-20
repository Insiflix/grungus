import { MatrixRuntime } from "../../src/renderer/app/MatrixRuntime";
import type { IMatrixClient } from "../../src/domain/matrix/IMatrixClient";
import type { IMatrixAuthProvider } from "../../src/domain/matrix/IMatrixAuthProvider";
import type { MatrixMessage, MatrixRoom, MatrixRoomMember } from "../../src/domain/matrix/MatrixTypes";

export const room: MatrixRoom = { id: "!performance:example", name: "Typing benchmark", avatarUrl: null, topic: "Local test data", unreadCount: 0, highlightCount: 0, isEncrypted: true, membership: "join", memberCount: 500 };
const members: MatrixRoomMember[] = Array.from({ length: 500 }, (_, i) => ({ id: `@member${i}:example`, displayName: `Member ${i}`, avatarUrl: null, membership: "join", powerLevel: 0, typing: false }));
const messages: MatrixMessage[] = Array.from({ length: 300 }, (_, i) => ({ id: `$message${i}`, roomId: room.id, sender: members[i % members.length], timestamp: 1700000000000 + i * 60000, type: "text", body: `Message ${i}: **project update** with a [link](https://example.com) and some inline code: \`const value = ${i}\`.\nA second paragraph with more text :smile:`, edited: false, replyTo: null, reactions: [], sendState: "sent", isOwn: false, isRedacted: false }));
const listeners = new Map<string, Set<(value: any) => void>>();
const emit = (name: string, value: unknown) => listeners.get(name)?.forEach(listener => listener(value));
export let typingRequests = 0;
let cryptoCost = false;
export function configureTypingBenchmark(simulateCrypto: boolean) { cryptoCost = simulateCrypto; }
const client = {
  subscribe(name: string, listener: (value: any) => void) { const set = listeners.get(name) ?? new Set(); set.add(listener); listeners.set(name, set); return () => set.delete(listener); },
  getRoom: () => room, getRooms: () => [room], getTimeline: () => messages,
  getRoomMembers: () => members, refreshTimeline: async () => messages, sendReadReceipt: async () => {},
  getUploadLimit: async () => null,
  setTyping: async () => {
    typingRequests++;
    if (cryptoCost) setTimeout(() => {
      // Reproduce the ~190ms WASM callback observed in the live app after a typing request.
      const end = performance.now() + 190;
      while (performance.now() < end) { /* synchronous crypto response simulation */ }
      syncTick();
    }, 20);
  },
} as unknown as IMatrixClient;
export const runtime = new MatrixRuntime(client, {} as IMatrixAuthProvider);
export const useMatrixRuntime = () => runtime;
emit("roomsChanged", [room]);
runtime.selectRoom(room.id);
let syncCount = 0;
export function syncTick() {
  emit("typingChanged", { roomId: room.id, members: [members[1]] });
  if (++syncCount % 10 === 0) {
    const updated = { ...messages[messages.length - 1], body: `Live message update ${syncCount}` };
    messages[messages.length - 1] = updated;
    emit("messageUpdated", updated);
  }
}
