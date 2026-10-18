import { beforeEach, describe, expect, it, vi } from "vitest";
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
  loadAvatar = vi.fn(async (url: string) => url);
  getOwnProfile = vi.fn();
  getIdentityState = vi.fn();
  refreshIdentity = vi.fn(async () => undefined);
  requestIdentityVerification = vi.fn(async () => undefined);
  acceptIdentityVerification = vi.fn(async () => undefined);
  startIdentityComparison = vi.fn(async () => undefined);
  confirmIdentityComparison = vi.fn(async () => undefined);
  cancelIdentityVerification = vi.fn(async () => undefined);
  recoverIdentity = vi.fn(async () => undefined);
  prepareIdentityReset = vi.fn(async () => undefined);
  resetIdentity = vi.fn(async () => undefined);
  submitIdentityAuth = vi.fn();
  cancelIdentityAuth = vi.fn();
  clearIdentitySecrets = vi.fn();
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
  inviteUser = vi.fn(async () => undefined);
  searchUsers = vi.fn(async () => []);
  startDirectMessage = vi.fn(async () => this.rooms[0]!);
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
  register: vi.fn(),
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
  beforeEach(() => vi.clearAllMocks());
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

  const invite: MatrixRoom = {
    id: "!invite:example.org", name: "An invitation", avatarUrl: null, topic: null,
    unreadCount: 0, highlightCount: 0, isEncrypted: true, membership: "invite", memberCount: 1,
  };

  it("keeps invitation selection out of the timeline until acceptance succeeds", async () => {
    const client = new FakeClient();
    const runtime = new MatrixRuntime(client, auth);
    client.rooms = [invite]; client.emit("roomsChanged", client.rooms);
    runtime.selectRoom(invite.id);
    expect(runtime.getSnapshot().selectedRoomId).toBeNull();
    client.joinRoom.mockImplementationOnce(async () => {
      client.rooms = [{ ...invite, membership: "join" }]; return client.rooms[0];
    });
    expect(await runtime.joinRoom(invite.id)).toBe(true);
    expect(runtime.getSnapshot().selectedRoomId).toBe(invite.id);
    expect(runtime.getSnapshot().rooms[0].membership).toBe("join");
  });

  it("preserves invitations on network failure and removes successful declines", async () => {
    const client = new FakeClient();
    const runtime = new MatrixRuntime(client, auth);
    client.rooms = [invite]; client.emit("roomsChanged", client.rooms);
    client.joinRoom.mockRejectedValueOnce(new Error("Offline"));
    expect(await runtime.joinRoom(invite.id)).toBe(false);
    expect(runtime.getSnapshot()).toMatchObject({ rooms: [invite], error: "Offline" });
    client.leaveRoom.mockRejectedValueOnce(new Error("Still offline"));
    expect(await runtime.declineInvite(invite.id)).toBe(false);
    expect(runtime.getSnapshot().rooms).toEqual([invite]);
    expect(await runtime.declineInvite(invite.id)).toBe(true);
    expect(runtime.getSnapshot().rooms).toEqual([]);
  });

  it("adds and selects a newly created DM immediately", async () => {
    const client = new FakeClient();
    const runtime = new MatrixRuntime(client, auth);
    client.startDirectMessage.mockResolvedValueOnce({ ...invite, membership: "join", isDirect: true });
    await runtime.startDirectMessage("@alice:example.org");
    expect(client.startDirectMessage).toHaveBeenCalledWith("@alice:example.org");
    expect(runtime.getSnapshot()).toMatchObject({ selectedRoomId: invite.id, rooms: [{ id: invite.id, isDirect: true }] });
  });

  it("retains registration verification until completion, then connects and persists the session", async () => {
    const client = new FakeClient();
    const runtime = new MatrixRuntime(client, auth);
    const capabilities = { serverName: "example.org", homeserverUrl: "https://example.org", password: true, browser: false, delegatedOAuth: false, identityProviders: [] };
    const session: MatrixSession = { homeserverUrl: capabilities.homeserverUrl, serverName: capabilities.serverName, accessToken: "token", userId: "@new:example.org", deviceId: "NEW" };
    const challenge = { session: "signup", flows: [{ stages: ["m.login.registration_token"] }], completed: [] };
    vi.mocked(auth.discover).mockResolvedValueOnce(capabilities);
    vi.mocked(auth.register).mockResolvedValueOnce({ challenge }).mockRejectedValueOnce(new Error("Invalid token")).mockResolvedValueOnce({ session });
    await runtime.discover("example.org");
    await runtime.register("new", "password");
    expect(runtime.getSnapshot()).toMatchObject({ phase: "signed-out", registrationChallenge: challenge });
    expect(client.start).not.toHaveBeenCalled();
    const authData = { session: "signup", type: "m.login.registration_token", token: "invited" };
    await runtime.register("new", "password", authData);
    expect(runtime.getSnapshot()).toMatchObject({ registrationChallenge: challenge, error: "Invalid token" });
    await runtime.register("new", "password", authData);
    expect(runtime.getSnapshot()).toMatchObject({ phase: "connected", registrationChallenge: null, error: null });
    expect(client.start).toHaveBeenCalledWith(session);
    expect(auth.persistSession).toHaveBeenCalledWith(session);
  });
});
