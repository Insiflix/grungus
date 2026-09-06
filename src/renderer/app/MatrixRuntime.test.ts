import { describe, expect, it, vi } from "vitest";
import type { IMatrixAuthProvider } from "../../domain/matrix/IMatrixAuthProvider";
import type { IMatrixClient } from "../../domain/matrix/IMatrixClient";
import type {
  MatrixApplicationEvents,
  MatrixEventListener,
  MatrixEventName,
} from "../../domain/matrix/MatrixEvents";
import type {
  MatrixMessage,
  MatrixRoom,
  MatrixSession,
} from "../../domain/matrix/MatrixTypes";
import { MatrixRuntime } from "./MatrixRuntime";

class FakeClient implements IMatrixClient {
  currentSession: MatrixSession | null = null;
  syncStatus = { state: "stopped" as const, error: null };
  rooms: MatrixRoom[] = [];
  timelines: Record<string, MatrixMessage[]> = {};
  private listeners = new Map<MatrixEventName, Set<(payload: unknown) => void>>();

  subscribe<K extends MatrixEventName>(event: K, listener: MatrixEventListener<K>) {
    const set = this.listeners.get(event) ?? new Set<(payload: unknown) => void>();
    set.add(listener as (payload: unknown) => void);
    this.listeners.set(event, set);
    return () => set.delete(listener as (payload: unknown) => void);
  }
  emit<K extends MatrixEventName>(event: K, payload: MatrixApplicationEvents[K]) {
    for (const listener of this.listeners.get(event) ?? []) listener(payload);
  }
  start = vi.fn(async (session: MatrixSession) => { this.currentSession = session; });
  stop = vi.fn(async () => undefined);
  logout = vi.fn(async () => undefined);
  getRooms = () => this.rooms;
  getRoom = (id: string) => this.rooms.find((room) => room.id === id) ?? null;
  joinRoom = vi.fn(async () => this.rooms[0]!);
  leaveRoom = vi.fn(async () => undefined);
  getTimeline = (id: string) => this.timelines[id] ?? [];
  loadOlderMessages = vi.fn(async (id: string) => ({ messages: this.getTimeline(id), hasMore: false }));
  sendTextMessage = vi.fn(async () => "$sent");
  editMessage = vi.fn(async () => "$edit");
  redactMessage = vi.fn(async () => undefined);
  setTyping = vi.fn(async () => undefined);
  sendReadReceipt = vi.fn(async () => undefined);
  addReaction = vi.fn(async () => "$reaction");
  removeReaction = vi.fn(async () => undefined);
  getRoomMembers = () => [];
  resolveMediaUrl = () => null;
}

const auth: IMatrixAuthProvider = {
  discover: vi.fn(),
  loginWithPassword: vi.fn(),
  startBrowserLogin: vi.fn(),
  completeBrowserLogin: vi.fn(),
  restoreSession: vi.fn(async () => null),
  persistSession: vi.fn(async () => null),
  clearSession: vi.fn(async () => undefined),
  subscribeToBrowserCallback: vi.fn(() => () => undefined),
};

describe("MatrixRuntime event bridge", () => {
  it("bootstraps only once and transitions to signed out without a session", async () => {
    const client = new FakeClient();
    const runtime = new MatrixRuntime(client, auth);

    await Promise.all([runtime.bootstrap(), runtime.bootstrap()]);

    expect(auth.restoreSession).toHaveBeenCalledTimes(1);
    expect(runtime.getSnapshot().phase).toBe("signed-out");
  });

  it("merges incoming application messages into the selected timeline", () => {
    const client = new FakeClient();
    const runtime = new MatrixRuntime(client, auth);
    const room: MatrixRoom = {
      id: "!room:example",
      name: "Test",
      avatarUrl: null,
      topic: null,
      unreadCount: 0,
      highlightCount: 0,
      isEncrypted: false,
      membership: "join",
      memberCount: 2,
    };
    client.rooms = [room];
    client.emit("roomsChanged", [room]);
    runtime.selectRoom(room.id);

    const message: MatrixMessage = {
      id: "$live",
      roomId: room.id,
      sender: { id: "@alice:example", displayName: "Alice", avatarUrl: null },
      timestamp: 42,
      type: "text",
      body: "Live update",
      edited: false,
      replyTo: null,
      reactions: [],
      sendState: "sent",
      isOwn: false,
      isRedacted: false,
    };
    client.emit("messageAdded", message);

    expect(runtime.getSnapshot().timelines[room.id]).toEqual([message]);
  });
});
