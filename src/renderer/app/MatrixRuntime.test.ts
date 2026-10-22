import { membershipNotices } from "../../domain/matrix/MembershipNotices";
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
  observeUserVerification = vi.fn(() => () => {});
  createPoll = vi.fn();
  observePoll = vi.fn(() => () => {});
  votePoll = vi.fn();
  endPoll = vi.fn();
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
  discoverSpaceRooms = vi.fn(async (): Promise<MatrixRoom[]> => []);
  getRoom = (id: string) => this.rooms.find((room) => room.id === id) ?? null;
  joinRoom = vi.fn(async () => this.rooms[0]!);
  leaveRoom = vi.fn(async () => undefined);
  inviteUser = vi.fn(async () => undefined);
  searchUsers = vi.fn(async () => []);
  startDirectMessage = vi.fn(async () => this.rooms[0]!);
  setDirectMessageClosed = vi.fn(async (roomId: string, closed: boolean) => {
    this.rooms = this.rooms.map(room => room.id === roomId ? { ...room, isDirectClosed: closed } : room);
    this.emit("roomsChanged", this.rooms);
  });
  getTimeline = (id: string) => this.timelines[id] ?? [];
  refreshTimeline = vi.fn(async (id: string) => this.getTimeline(id));
  loadOlderMessages = vi.fn(async (id: string) => ({ messages: this.getTimeline(id), hasMore: false }));
  getUploadLimit = vi.fn(async () => null);
  sendAttachment = vi.fn(async () => "$attachment");
  loadAttachment = vi.fn(async () => new Blob());
  sendTextMessage = vi.fn(async () => "$sent");
  editMessage = vi.fn(async () => "$edit");
  redactMessage = vi.fn(async () => undefined);
  setMessagePinned = vi.fn(async () => undefined);
  setTyping = vi.fn(async () => undefined);
  sendReadReceipt = vi.fn(async () => undefined);
  retryMessage = vi.fn(async () => undefined);
  cancelSend = vi.fn(async () => undefined);
  searchMessages = vi.fn(async () => ({ messages: [], scanned: 0, roomsDone: 0, totalRooms: 0, undecryptable: 0, limited: false }));
  getMessageContext = vi.fn(async () => [] as MatrixMessage[]);
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
  it("does not mark hidden voice chat read on selection or refresh, and reads new messages on reopening", async () => {
    const client = new FakeClient();
    const runtime = new MatrixRuntime(client, auth);
    const room: MatrixRoom = { id: "!voice:example", name: "Voice", avatarUrl: null, topic: null, unreadCount: 2, highlightCount: 0, isEncrypted: true, membership: "join", memberCount: 2 };
    const message: MatrixMessage = { id: "$before", roomId: room.id, sender: { id: "@alice:example", displayName: "Alice", avatarUrl: null }, timestamp: 1, type: "text", body: "Hello", edited: false, replyTo: null, reactions: [], sendState: "sent", isOwn: false, isRedacted: false };
    client.rooms = [room]; client.timelines[room.id] = [message]; client.emit("roomsChanged", client.rooms);
    runtime.setRoomChatVisible(room.id, false);
    runtime.selectRoom(room.id);
    await Promise.resolve(); await Promise.resolve();
    expect(client.sendReadReceipt).not.toHaveBeenCalled();
    client.emit("messageAdded", { ...message, id: "$hidden", timestamp: 2 });
    runtime.setRoomChatVisible(room.id, true);
    expect(client.sendReadReceipt).toHaveBeenLastCalledWith(room.id, "$hidden");
  });
  it("discards old account history when pagination completes after logout", async () => {
    const client = new FakeClient();
    const runtime = new MatrixRuntime(client, auth);
    Object.assign(runtime.getSnapshot(), { session: { userId: "@old:example" } });
    let finish!: (page: { messages: MatrixMessage[]; hasMore: boolean }) => void;
    client.loadOlderMessages.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const loading = runtime.loadOlder("!old:example");
    await runtime.logout();
    Object.assign(runtime.getSnapshot(), { session: { userId: "@new:example" } });
    finish({ messages: [], hasMore: true });
    expect(await loading).toBe(false);
    expect(runtime.getSnapshot().timelines).toEqual({});
  });
  it("clears private UI state even when removing the saved session fails", async () => {
    const runtime = new MatrixRuntime(new FakeClient(), auth);
    Object.assign(runtime.getSnapshot(), { session: { userId: "@old:example" }, selectedRoomId: "!private:example" });
    vi.mocked(auth.clearSession).mockRejectedValueOnce(new Error("disk unavailable"));
    await expect(runtime.logout()).rejects.toThrow("disk unavailable");
    expect(runtime.getSnapshot()).toMatchObject({ session: null, phase: "signed-out", selectedRoomId: null, timelines: {} });
  });
  it("deduplicates channel discovery and discards results after logout", async () => {
    const client = new FakeClient();
    const runtime = new MatrixRuntime(client, auth);
    let finish!: (rooms: MatrixRoom[]) => void;
    Object.assign(runtime.getSnapshot(), { session: { userId: "@me:example" } });
    client.discoverSpaceRooms.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const first = runtime.discoverSpaceRooms("!server");
    const second = runtime.discoverSpaceRooms("!server");
    expect(client.discoverSpaceRooms).toHaveBeenCalledOnce();
    await runtime.logout();
    finish([]);
    await Promise.all([first, second]);
    expect(runtime.getSnapshot().spaceRooms).toEqual({});
  });
  it("publishes live presence updates without duplicating unchanged snapshots and clears them at logout", async () => {
    const client = new FakeClient();
    const runtime = new MatrixRuntime(client, auth);
    const listener = vi.fn();
    runtime.subscribe(listener);
    client.emit("presenceChanged", { userId: "@alice:example", presence: "online" });
    expect(runtime.getSnapshot().presences["@alice:example"]).toBe("online");
    client.emit("presenceChanged", { userId: "@alice:example", presence: "online" });
    expect(listener).toHaveBeenCalledTimes(1);
    client.emit("presenceChanged", { userId: "@alice:example", presence: "offline" });
    expect(runtime.getSnapshot().presences["@alice:example"]).toBe("offline");
    await runtime.logout();
    expect(runtime.getSnapshot().presences).toEqual({});
  });
  it("limits placeholder cleanup to encrypted rows and preserves actual chat messages", () => {
    const client = new FakeClient();
    const runtime = new MatrixRuntime(client, auth);
    const room: MatrixRoom = { id: "!room:example", name: "Room", avatarUrl: null, topic: null, unreadCount: 0, highlightCount: 0, isEncrypted: true, membership: "join", memberCount: 2 };
    const message: MatrixMessage = { id: "$hui", roomId: room.id, sender: { id: "@slitix:example", displayName: "Slitix", avatarUrl: null }, timestamp: 1, type: "text", body: "hui", edited: false, replyTo: null, reactions: [], sendState: "sent", isOwn: false, isRedacted: false };
    client.rooms = [room]; client.timelines[room.id] = [message, { ...message, id: "$placeholder", type: "encrypted" }];
    client.emit("roomsChanged", client.rooms); runtime.selectRoom(room.id);
    client.emit("messageRemoved", { roomId: room.id, eventId: "$hui", placeholderOnly: true });
    client.emit("messageRemoved", { roomId: room.id, eventId: "$placeholder", placeholderOnly: true });
    expect(runtime.getSnapshot().timelines[room.id].map(message => message.id)).toEqual(["$hui"]);
    client.emit("messageRemoved", { roomId: room.id, eventId: "$hui" });
    expect(runtime.getSnapshot().timelines[room.id]).toEqual([]);
  });

  it("keeps displayed messages when older pagination returns another SDK history window", async () => {
    const client = new FakeClient();
    const runtime = new MatrixRuntime(client, auth);
    const room: MatrixRoom = { id: "!room:example", name: "Room", avatarUrl: null, topic: null, unreadCount: 0, highlightCount: 0, isEncrypted: true, membership: "join", memberCount: 2 };
    const message: MatrixMessage = { id: "$hui", roomId: room.id, sender: { id: "@slitix:example", displayName: "Slitix", avatarUrl: null }, timestamp: 2, type: "text", body: "hui", edited: false, replyTo: null, reactions: [], sendState: "sent", isOwn: false, isRedacted: false };
    client.rooms = [room]; client.timelines[room.id] = [message];
    client.emit("roomsChanged", client.rooms); runtime.selectRoom(room.id);
    client.loadOlderMessages.mockResolvedValueOnce({ messages: [{ ...message, id: "$older", timestamp: 1 }], hasMore: true });
    await runtime.loadOlder(room.id);
    expect(runtime.getSnapshot().timelines[room.id].map(message => message.id)).toEqual(["$older", "$hui"]);
  });
  it("closes a duplicate tab, selects the original conversation, and reopens closed DMs from search", async () => {
    const client = new FakeClient();
    const runtime = new MatrixRuntime(client, auth);
    const original: MatrixRoom = { id: "!original:example", name: "Slitix", avatarUrl: null, topic: null, unreadCount: 0, highlightCount: 0, isEncrypted: true, membership: "join", memberCount: 2, isDirect: true };
    const duplicate = { ...original, id: "!duplicate:example" };
    client.rooms = [original, duplicate]; client.emit("roomsChanged", client.rooms);
    runtime.selectRoom(duplicate.id);
    expect(await runtime.closeDirectMessage(duplicate.id)).toBe(true);
    expect(runtime.getSnapshot().selectedRoomId).toBe(original.id);
    expect(runtime.getSnapshot().rooms.find(room => room.id === duplicate.id)?.isDirectClosed).toBe(true);
    expect(client.leaveRoom).not.toHaveBeenCalled();
    runtime.selectRoom(duplicate.id);
    expect(client.setDirectMessageClosed).toHaveBeenLastCalledWith(duplicate.id, false);
    expect(runtime.getSnapshot().rooms.find(room => room.id === duplicate.id)?.isDirectClosed).toBe(false);
  });

  it("does not hide a DM when saving its closed state fails", async () => {
    const client = new FakeClient();
    const runtime = new MatrixRuntime(client, auth);
    client.setDirectMessageClosed.mockRejectedValueOnce(new Error("Offline"));
    expect(await runtime.closeDirectMessage("!dm:example")).toBe(false);
    expect(runtime.getSnapshot().error).toBe("Offline");
  });
  it("refreshes an opened chat without dropping older history or messages arriving in flight", async () => {
    const client = new FakeClient();
    const runtime = new MatrixRuntime(client, auth);
    const room: MatrixRoom = { id: "!room:example", name: "Hanno", avatarUrl: null, topic: null, unreadCount: 0, highlightCount: 0, isEncrypted: true, membership: "join", memberCount: 2 };
    const old: MatrixMessage = { id: "$old", roomId: room.id, sender: { id: "@hanno:example", displayName: "Hanno", avatarUrl: null }, timestamp: 1, type: "text", body: "Old", edited: false, replyTo: null, reactions: [], sendState: "sent", isOwn: false, isRedacted: false };
    client.rooms = [room]; client.timelines[room.id] = [old];
    client.emit("roomsChanged", client.rooms);
    let finish!: (messages: MatrixMessage[]) => void;
    client.refreshTimeline.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    runtime.selectRoom(room.id);
    client.emit("messageAdded", { ...old, id: "$live", timestamp: 3 });
    finish([{ ...old, id: "$new", timestamp: 2 }]);
    await vi.waitFor(() => expect(runtime.getSnapshot().timelines[room.id].map(message => message.id)).toEqual(["$old", "$new", "$live"]));
    expect(client.refreshTimeline).toHaveBeenCalledWith(room.id);
  });

  it("keeps cached chat history visible when refreshing the latest messages fails", async () => {
    const client = new FakeClient();
    const runtime = new MatrixRuntime(client, auth);
    const room: MatrixRoom = { id: "!room:example", name: "Hanno", avatarUrl: null, topic: null, unreadCount: 0, highlightCount: 0, isEncrypted: true, membership: "join", memberCount: 2 };
    client.rooms = [room]; client.emit("roomsChanged", client.rooms);
    client.refreshTimeline.mockRejectedValueOnce(new Error("Offline"));
    runtime.selectRoom(room.id);
    await vi.waitFor(() => expect(runtime.getSnapshot().error).toContain("Unable to refresh messages: Offline"));
    expect(runtime.getSnapshot().selectedRoomId).toBe(room.id);
    expect(runtime.getSnapshot().timelines[room.id]).toEqual([]);
  });
  it("removes an own reaction using its current server ID rather than a stale local ID", async () => {
    const client = new FakeClient();
    const runtime = new MatrixRuntime(client, auth);
    const message: MatrixMessage = { id: "$message", roomId: "!room:example", sender: { id: "@me:example", displayName: "Me", avatarUrl: null }, timestamp: 1, type: "text", body: "Hi", edited: false, replyTo: null, reactions: [{ key: "👍", count: 1, userIds: ["@me:example"], eventId: "~local" }], sendState: "sent", isOwn: true, isRedacted: false };
    client.timelines[message.roomId] = [{ ...message, reactions: [{ ...message.reactions[0], eventId: "$server-reaction" }] }];
    await runtime.toggleReaction(message.roomId, message, "👍");
    expect(client.removeReaction).toHaveBeenCalledWith(message.roomId, "$server-reaction");
    expect(client.addReaction).not.toHaveBeenCalled();
  });

  it("serializes quick repeated toggles and reads the updated reactions", async () => {
    const client = new FakeClient();
    const runtime = new MatrixRuntime(client, auth);
    const message: MatrixMessage = { id: "$message", roomId: "!room:example", sender: { id: "@me:example", displayName: "Me", avatarUrl: null }, timestamp: 1, type: "text", body: "Hi", edited: false, replyTo: null, reactions: [], sendState: "sent", isOwn: true, isRedacted: false };
    client.timelines[message.roomId] = [message];
    client.addReaction.mockImplementationOnce(async () => {
      client.timelines[message.roomId] = [{ ...message, reactions: [{ key: "👍", count: 1, userIds: ["@me:example"], eventId: "$reaction" }] }];
      return "$reaction";
    });
    await Promise.all([runtime.toggleReaction(message.roomId, message, "👍"), runtime.toggleReaction(message.roomId, message, "👍")]);
    expect(client.addReaction).toHaveBeenCalledOnce();
    expect(client.removeReaction).toHaveBeenCalledWith(message.roomId, "$reaction");
  });
  beforeEach(() => vi.clearAllMocks());
  it("bootstraps only once and transitions to signed out without a session", async () => {
    const client = new FakeClient();
    const runtime = new MatrixRuntime(client, auth);

    await Promise.all([runtime.bootstrap(), runtime.bootstrap()]);

    expect(auth.restoreSession).toHaveBeenCalledTimes(1);
    expect(runtime.getSnapshot().phase).toBe("signed-out");
  });

  it("keeps the splash visible throughout saved-session startup", async () => {
    const client = new FakeClient();
    const runtime = new MatrixRuntime(client, auth);
    const session: MatrixSession = {
      homeserverUrl: "https://example.org", serverName: "example.org",
      accessToken: "token", userId: "@alice:example.org", deviceId: "DEVICE",
    };
    vi.mocked(auth.restoreSession).mockResolvedValueOnce(session);
    let finishStartup!: () => void;
    client.start.mockImplementationOnce(() => new Promise<void>((resolve) => { finishStartup = resolve; }));
    const phases = [runtime.getSnapshot().phase];
    runtime.subscribe(() => phases.push(runtime.getSnapshot().phase));

    const bootstrap = runtime.bootstrap();
    await vi.waitFor(() => expect(client.start).toHaveBeenCalledWith(session));
    expect(runtime.getSnapshot()).toMatchObject({ phase: "restoring", session });
    expect(phases.every((phase) => phase === "restoring")).toBe(true);

    finishStartup();
    await bootstrap;
    expect(runtime.getSnapshot().phase).toBe("connected");
    expect(phases).not.toContain("authenticating");
    expect(phases).not.toContain("signed-out");
  });

  it("returns to login with an error when saved-session startup fails", async () => {
    const client = new FakeClient();
    const runtime = new MatrixRuntime(client, auth);
    vi.mocked(auth.restoreSession).mockResolvedValueOnce({
      homeserverUrl: "https://example.org", serverName: "example.org",
      accessToken: "token", userId: "@alice:example.org", deviceId: "DEVICE",
    });
    client.start.mockRejectedValueOnce(new Error("Session expired"));

    await runtime.bootstrap();

    expect(auth.clearSession).toHaveBeenCalledOnce();
    expect(runtime.getSnapshot()).toMatchObject({
      phase: "signed-out", session: null, error: "Session restore failed: Session expired",
    });
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
    membershipNotices.clear();
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
    expect(membershipNotices.getSnapshot()).toMatchObject({ action: "join", kind: "room", name: invite.name });
    membershipNotices.clear();
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
