import { beforeEach, describe, expect, it, vi } from "vitest";
import { ClientEvent, createClient, EventType, EventStatus, MatrixEvent, MatrixEventEvent, Preset, RoomEvent, RoomStateEvent, SyncState, SSOAction, type MatrixClient, type Room } from "matrix-js-sdk";
import type { MatrixAuthCapabilities, MatrixSession } from "../../domain/matrix/MatrixTypes";
import { MatrixAuthProvider } from "./MatrixAuthProvider";
import { MatrixJsSdkClient } from "./MatrixJsSdkClient";
import { closedDirectRoomsEvent } from "./MatrixClosedDirectRooms";

vi.mock("matrix-js-sdk", async (importOriginal) => ({
  ...await importOriginal<typeof import("matrix-js-sdk")>(), createClient: vi.fn(),
}));

const capabilities: MatrixAuthCapabilities = {
  serverName: "example.org", homeserverUrl: "https://matrix.example.org",
  password: true, browser: false, delegatedOAuth: false, identityProviders: [],
};
const session: MatrixSession = {
  homeserverUrl: capabilities.homeserverUrl, serverName: capabilities.serverName,
  accessToken: "test-token", userId: "@me:example.org", deviceId: "DEVICE",
};
const login = { access_token: session.accessToken, user_id: session.userId, device_id: session.deviceId };

function sdkRoom(id: string, membership = "join", direct = false, space = false): Room {
  return {
    roomId: id, name: id, getMyMembership: () => membership,
    currentState: { getStateEvents: () => null, maySendStateEvent: () => false },
    getDMInviter: () => direct ? "@alice:example.org" : undefined,
    isSpaceRoom: () => space,
    getLiveTimeline: () => ({ getEvents: () => [], getState: () => ({ getStateEvents: (type: string) => type === EventType.SpaceChild ? [] : undefined }) }),
    getMxcAvatarUrl: () => null, getUnreadNotificationCount: () => 0,
    hasEncryptionStateEvent: () => true, getJoinedMemberCount: () => 2,
    getMember: () => null,
    findEventById: () => undefined,
    getUnfilteredTimelineSet: () => ({ relations: { getChildEventsForEvent: () => undefined } }),
  } as unknown as Room;
}

function setup() {
  const rooms: Room[] = [];
  let direct: Record<string, string[]> = {};
  let closed = { rooms: [] as string[] };
  const sdk = {
    on: vi.fn(), off: vi.fn(), initRustCrypto: vi.fn(), startClient: vi.fn(),
    stopClient: vi.fn(), logout: vi.fn(), loginRequest: vi.fn(async () => login),
    getRooms: () => rooms, getRoom: (id: string) => rooms.find((room) => room.roomId === id),
    getJoinedRooms: vi.fn(async () => ({ joined_rooms: rooms.filter(room => room.getMyMembership() === "join").map(room => room.roomId) })),
    getUserId: () => session.userId,
    getHomeserverUrl: () => session.homeserverUrl,
    getProfileInfo: vi.fn(async () => ({ displayname: "My display name", avatar_url: "mxc://example.org/my-avatar" })),
    getAccountData: (type: string) => ({ getContent: () => type === closedDirectRoomsEvent ? closed : direct }),
    setAccountData: vi.fn(async (type: string, value: Record<string, string[]>) => { if (type === closedDirectRoomsEvent) closed = { rooms: value.rooms }; else direct = value; }),
    createRoom: vi.fn(async () => { const room = sdkRoom("!new:example.org"); rooms.push(room); return { room_id: room.roomId }; }),
    invite: vi.fn(async () => ({})),
    joinRoom: vi.fn(async (id: string) => rooms.find((room) => room.roomId === id)!),
    leave: vi.fn(async () => ({})),
    searchUserDirectory: vi.fn(async () => ({ results: [
      { user_id: session.userId, display_name: "Me" },
      { user_id: "@alice:example.org", display_name: "Alice" },
    ] })),
    registerRequest: vi.fn(),
    sendStateEvent: vi.fn(async () => ({ event_id: "$pin" })),
    sendEvent: vi.fn(async () => ({ event_id: "$message" })),
    resendEvent: vi.fn(async () => ({ event_id: "$retried" })), cancelPendingEvent: vi.fn(),
    getSsoLoginUrl: vi.fn((_callback?: string) => "https://matrix.example.org/sso"),
  };
  vi.mocked(createClient).mockReturnValue(sdk as unknown as MatrixClient);
  return { sdk, rooms };
}

beforeEach(() => vi.clearAllMocks());

describe("authentication security", () => {
  it("retries the existing pending event and cancels only failed own sends", async () => {
    const { sdk, rooms } = setup(); const room = sdkRoom("!pending:example.org"); rooms.push(room);
    const event = new MatrixEvent({ event_id: "~pending", room_id: room.roomId, sender: session.userId, type: EventType.RoomMessage, content: { msgtype: "m.text", body: "Pending" } });
    event.setStatus(EventStatus.NOT_SENT); room.getPendingEvents = () => [event];
    const client = new MatrixJsSdkClient(); await client.start(session);
    await client.retryMessage(room.roomId, "~pending"); expect(sdk.resendEvent).toHaveBeenCalledWith(event, room);
    const removed = vi.fn(); client.subscribe("messageRemoved", removed);
    await client.cancelSend(room.roomId, "~pending"); expect(sdk.cancelPendingEvent).toHaveBeenCalledWith(event);
    expect(removed).toHaveBeenCalledWith({ roomId: room.roomId, eventId: "~pending" });
    event.setStatus(EventStatus.SENT); await expect(client.retryMessage(room.roomId, "~pending")).rejects.toThrow("already sent");
    await expect(client.cancelSend(room.roomId, "~pending")).rejects.toThrow("Only failed");
    expect(sdk.sendEvent).not.toHaveBeenCalled();
  });
  it("rejects forged, mismatched and replayed browser callbacks before exchanging tokens", async () => {
    const { sdk } = setup();
    vi.stubGlobal("window", { desktop: { auth: { openExternal: vi.fn() } } });
    try {
      const provider = new MatrixAuthProvider();
      await provider.startBrowserLogin({ ...capabilities, browser: true });
      const callback = new URL(sdk.getSsoLoginUrl.mock.calls[0][0]!);
      const state = callback.searchParams.get("state")!;
      await expect(provider.completeBrowserLogin("grungus-matrix://auth/callback?loginToken=attacker")).rejects.toThrow("invalid");
      await expect(provider.completeBrowserLogin(`grungus-matrix://auth/wrong?state=${state}&loginToken=attacker`)).rejects.toThrow("invalid");
      await expect(provider.completeBrowserLogin(`${callback.href}&state=${state}&loginToken=attacker`)).rejects.toThrow("invalid");
      expect(sdk.loginRequest).not.toHaveBeenCalled();
      const valid = `${callback.href}&loginToken=one-time-token`;
      expect(await provider.completeBrowserLogin(valid)).toEqual(session);
      await expect(provider.completeBrowserLogin(valid)).rejects.toThrow("No browser login");
      expect(sdk.loginRequest).toHaveBeenCalledOnce();
    } finally { vi.unstubAllGlobals(); }
  });
  it("expires browser login attempts", async () => {
    const { sdk } = setup();
    const now = vi.spyOn(Date, "now").mockReturnValue(0);
    vi.stubGlobal("window", { desktop: { auth: { openExternal: vi.fn() } } });
    try {
      const provider = new MatrixAuthProvider();
      await provider.startBrowserLogin({ ...capabilities, browser: true });
      now.mockReturnValue(10 * 60_000 + 1);
      await expect(provider.completeBrowserLogin(`${sdk.getSsoLoginUrl.mock.calls[0][0]}&loginToken=test`)).rejects.toThrow("expired");
      expect(sdk.loginRequest).not.toHaveBeenCalled();
    } finally { now.mockRestore(); vi.unstubAllGlobals(); }
  });
  it("refuses plaintext credential transport and pins tokens to the login homeserver", async () => {
    const { sdk } = setup();
    const provider = new MatrixAuthProvider();
    await expect(provider.loginWithPassword({ ...capabilities, homeserverUrl: "http://remote.example.org" }, "me", "password")).rejects.toThrow();
    expect(sdk.loginRequest).not.toHaveBeenCalled();
    sdk.loginRequest.mockResolvedValueOnce({ ...login, well_known: { "m.homeserver": { base_url: "https://unrelated.example.org" } } } as typeof login);
    expect((await provider.loginWithPassword(capabilities, "me", "password")).homeserverUrl).toBe(capabilities.homeserverUrl);
  });
  it("does not restart an SDK client when logout happens during crypto initialization", async () => {
    const { sdk } = setup();
    let ready!: () => void;
    sdk.initRustCrypto.mockImplementationOnce(() => new Promise<void>(resolve => { ready = resolve; }));
    const client = new MatrixJsSdkClient();
    const starting = client.start(session);
    await client.stop();
    ready();
    await expect(starting).rejects.toThrow("ended");
    expect(sdk.startClient).not.toHaveBeenCalled();
    expect(client.currentSession).toBeNull();
  });
});

describe("registration", () => {
  it("requests browser registration rather than login for SSO signup", async () => {
    const { sdk } = setup();
    const openExternal = vi.fn();
    vi.stubGlobal("window", { desktop: { auth: { openExternal } } });
    try {
      await new MatrixAuthProvider().startBrowserLogin({ ...capabilities, browser: true }, { register: true });
      expect(sdk.getSsoLoginUrl).toHaveBeenCalledWith(expect.stringMatching(/^grungus-matrix:\/\/auth\/callback\?state=[\da-f-]+$/), "sso", undefined, SSOAction.REGISTER);
      expect(openExternal).toHaveBeenCalledWith("https://matrix.example.org/sso");
    } finally { vi.unstubAllGlobals(); }
  });

  it("completes dummy auth and returns a usable session", async () => {
    const { sdk } = setup();
    sdk.registerRequest.mockRejectedValueOnce({ httpStatus: 401, data: {
      session: "signup", flows: [{ stages: ["m.login.dummy"] }],
    } }).mockResolvedValueOnce(login);
    expect(await new MatrixAuthProvider().register(capabilities, "me", "password")).toEqual({ session });
    expect(sdk.registerRequest.mock.calls[1][0].auth).toEqual({ session: "signup", type: "m.login.dummy" });
    expect(sdk.registerRequest.mock.calls[0][0]).toMatchObject({ username: "me", password: "password", inhibit_login: false });
  });

  it("preserves the server session and completed stages for browser verification", async () => {
    const { sdk } = setup();
    const challenge = { session: "signup", flows: [{ stages: ["m.login.recaptcha", "m.login.terms", "m.login.dummy"] }], completed: ["m.login.recaptcha"] };
    sdk.registerRequest.mockRejectedValue({ httpStatus: 401, data: challenge });
    expect(await new MatrixAuthProvider().register(capabilities, "me", "password")).toEqual({ challenge });
    expect(sdk.registerRequest).toHaveBeenCalledOnce();
  });

  it("submits a registration token in the existing verification session", async () => {
    const { sdk } = setup();
    sdk.registerRequest.mockResolvedValue(login);
    const auth = { session: "signup", type: "m.login.registration_token", token: "invite-token" };
    await new MatrixAuthProvider().register(capabilities, "me", "password", auth);
    expect(sdk.registerRequest).toHaveBeenCalledWith(expect.objectContaining({ auth }));
  });

  it("reports verification and disabled-registration errors without losing them", async () => {
    const { sdk } = setup();
    sdk.registerRequest.mockRejectedValueOnce({ httpStatus: 401, data: {
      session: "signup", flows: [{ stages: ["m.login.registration_token"] }], errcode: "M_FORBIDDEN", error: "Invalid token",
    } }).mockRejectedValueOnce({ httpStatus: 403, data: { errcode: "M_FORBIDDEN", error: "Registration disabled" } });
    const provider = new MatrixAuthProvider();
    await expect(provider.register(capabilities, "me", "password")).rejects.toThrow("Invalid token");
    await expect(provider.register(capabilities, "me", "password")).rejects.toThrow("Registration disabled");
  });

  it("does not submit malformed usernames or empty passwords", async () => {
    const { sdk } = setup();
    const provider = new MatrixAuthProvider();
    await expect(provider.register(capabilities, "@me:example.org", "password")).rejects.toThrow("username");
    await expect(provider.register(capabilities, "me", "")).rejects.toThrow("password");
    expect(sdk.registerRequest).not.toHaveBeenCalled();
  });
});

describe("people and invitations", () => {
  it.each(["m.reaction", "io.element.call.encryption_keys"])("removes a stale encryption placeholder when it decrypts into %s", async type => {
    const { sdk, rooms } = setup();
    const room = sdkRoom("!room:example.org"); rooms.push(room);
    const client = new MatrixJsSdkClient(); await client.start(session);
    const removed = vi.fn(); client.subscribe("messageRemoved", removed);
    const event = new MatrixEvent({ event_id: "$formerly-encrypted", room_id: room.roomId, type, content: { "m.relates_to": { rel_type: "m.annotation", event_id: "$parent", key: "👍" } } });
    sdk.on.mock.calls.find(([name]) => name === MatrixEventEvent.Decrypted)?.[1]?.(event);
    expect(removed).toHaveBeenCalledWith({ roomId: room.roomId, eventId: "$formerly-encrypted", placeholderOnly: true });
  });

  it("keeps an actual undecryptable message visible", async () => {
    const { sdk, rooms } = setup();
    const room = sdkRoom("!room:example.org"); rooms.push(room);
    const client = new MatrixJsSdkClient(); await client.start(session);
    const removed = vi.fn(), updated = vi.fn(); client.subscribe("messageRemoved", removed); client.subscribe("messageUpdated", updated);
    const event = new MatrixEvent({ event_id: "$missing-key", room_id: room.roomId, type: EventType.RoomMessageEncrypted, sender: session.userId, content: {} });
    vi.spyOn(event, "isDecryptionFailure").mockReturnValue(true);
    sdk.on.mock.calls.find(([name]) => name === MatrixEventEvent.Decrypted)?.[1]?.(event);
    expect(removed).not.toHaveBeenCalled();
    expect(updated).toHaveBeenCalledWith(expect.objectContaining({ id: "$missing-key", type: "encrypted", body: "Unable to decrypt this message" }));
  });

  it("closes only the chosen duplicate DM and can reopen it without leaving or creating rooms", async () => {
    const { sdk, rooms } = setup();
    const original = sdkRoom("!original:example.org", "join", true), duplicate = sdkRoom("!duplicate:example.org", "join", true);
    rooms.push(original, duplicate);
    await sdk.setAccountData(EventType.Direct, { "@alice:example.org": [original.roomId, duplicate.roomId] });
    const client = new MatrixJsSdkClient(); await client.start(session);
    await client.setDirectMessageClosed(duplicate.roomId, true);
    expect(client.getRooms().find(room => room.id === duplicate.roomId)).toMatchObject({ isDirectClosed: true, membership: "join" });
    expect(client.getRooms().find(room => room.id === original.roomId)?.isDirectClosed).toBe(false);
    expect(sdk.setAccountData).toHaveBeenLastCalledWith(closedDirectRoomsEvent, { rooms: [duplicate.roomId] });
    await client.setDirectMessageClosed(duplicate.roomId, false);
    expect(client.getRooms().find(room => room.id === duplicate.roomId)?.isDirectClosed).toBe(false);
    expect(sdk.leave).not.toHaveBeenCalled(); expect(sdk.createRoom).not.toHaveBeenCalled();
  });

  it("preserves each closed DM when close actions arrive together", async () => {
    const { rooms } = setup();
    const first = sdkRoom("!first:example.org", "join", true), second = sdkRoom("!second:example.org", "join", true);
    rooms.push(first, second);
    const client = new MatrixJsSdkClient(); await client.start(session);
    await Promise.all([client.setDirectMessageClosed(first.roomId, true), client.setDirectMessageClosed(second.roomId, true)]);
    expect(client.getRooms().every(room => room.isDirectClosed)).toBe(true);
  });

  it("reloads closed conversations from account data after initial sync", async () => {
    const { sdk, rooms } = setup();
    const room = sdkRoom("!closed:example.org", "join", true); rooms.push(room);
    await sdk.setAccountData(closedDirectRoomsEvent, { rooms: [room.roomId] });
    const client = new MatrixJsSdkClient(); await client.start(session);
    sdk.on.mock.calls.find(([name]) => name === ClientEvent.Sync)?.[1]?.(SyncState.Prepared);
    expect(client.getRooms()[0].isDirectClosed).toBe(true);
  });
  it("sends Matrix mentions alongside reply metadata and only pings people in the room", async () => {
    const { sdk, rooms } = setup();
    const room = sdkRoom("!mentions:example.org");
    room.getMembers = () => [
      { userId: "@alice:example.org", name: "Alice", membership: "join", getMxcAvatarUrl: () => null },
      { userId: "@bob:example.org", name: "Bob", membership: "leave", getMxcAvatarUrl: () => null },
    ] as never;
    rooms.push(room);
    const client = new MatrixJsSdkClient(); await client.start(session);
    await client.sendTextMessage(room.roomId, "Hey @alice:example.org @bob:example.org", { replyToEventId: "$original" });
    expect(sdk.sendEvent).toHaveBeenLastCalledWith(room.roomId, EventType.RoomMessage, expect.objectContaining({
      "m.mentions": { user_ids: ["@alice:example.org"] }, "m.relates_to": { "m.in_reply_to": { event_id: "$original" } },
      format: "org.matrix.custom.html", formatted_body: expect.stringContaining(">@Alice</a>"),
    }));
  });

  it("preserves mention metadata on edits while only notifying newly mentioned members", async () => {
    const { sdk, rooms } = setup();
    const room = sdkRoom("!mentions:example.org");
    room.getMembers = () => ["alice", "bob"].map(name => ({ userId: `@${name}:example.org`, name, membership: "join", getMxcAvatarUrl: () => null })) as never;
    room.findEventById = () => new MatrixEvent({ type: EventType.RoomMessage, content: { body: "Hey @alice:example.org", msgtype: "m.text", "m.mentions": { user_ids: ["@alice:example.org"] } } });
    rooms.push(room);
    const client = new MatrixJsSdkClient(); await client.start(session);
    await client.editMessage(room.roomId, "$original", "Hey @alice:example.org and @bob:example.org");
    expect(sdk.sendEvent).toHaveBeenLastCalledWith(room.roomId, EventType.RoomMessage, expect.objectContaining({
      "m.mentions": { user_ids: ["@bob:example.org"] },
      "m.new_content": expect.objectContaining({ "m.mentions": { user_ids: ["@alice:example.org", "@bob:example.org"] } }),
    }));
  });
  it("restores a server-joined DM that the SDK incorrectly marks as left", async () => {
    const { sdk, rooms } = setup();
    const room = sdkRoom("!stale-dm:example.org", "leave", true);
    let membership = "leave";
    room.getMyMembership = () => membership;
    room.updateMyMembership = vi.fn(value => { membership = value; });
    rooms.push(room);
    sdk.getJoinedRooms.mockResolvedValueOnce({ joined_rooms: [room.roomId] });
    const client = new MatrixJsSdkClient(); await client.start(session);
    const sync = sdk.on.mock.calls.find(([name]) => name === ClientEvent.Sync)?.[1];
    sync?.(SyncState.Prepared);
    await vi.waitFor(() => expect(client.getRooms()).toContainEqual(expect.objectContaining({ id: room.roomId, isDirect: true, membership: "join" })));
    expect(room.updateMyMembership).toHaveBeenCalledWith("join");
  });

  it("does not override a membership update received while reconciliation is in flight", async () => {
    const { sdk, rooms } = setup();
    const room = sdkRoom("!left:example.org", "leave", true);
    room.updateMyMembership = vi.fn(); rooms.push(room);
    let finish!: (value: { joined_rooms: string[] }) => void;
    sdk.getJoinedRooms.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const client = new MatrixJsSdkClient(); await client.start(session);
    sdk.on.mock.calls.find(([name]) => name === ClientEvent.Sync)?.[1]?.(SyncState.Prepared);
    sdk.on.mock.calls.find(([name]) => name === RoomEvent.MyMembership)?.[1]?.(room);
    finish({ joined_rooms: [room.roomId] });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(room.updateMyMembership).not.toHaveBeenCalled();
  });
  it("reopens an existing direct conversation with missing account data instead of creating a duplicate", async () => {
    const { sdk, rooms } = setup();
    rooms.push(sdkRoom("!old-dm:example.org", "join", true));
    const client = new MatrixJsSdkClient(); await client.start(session);
    const recovered = await client.startDirectMessage("@alice:example.org");
    expect(recovered).toMatchObject({ id: "!old-dm:example.org", isDirect: true });
    expect(sdk.createRoom).not.toHaveBeenCalled();
    expect(sdk.setAccountData).toHaveBeenLastCalledWith(EventType.Direct, { "@alice:example.org": ["!old-dm:example.org"] });
  });
  it("refreshes the parent message when a local reaction receives its server ID and is redacted", async () => {
    const { sdk, rooms } = setup();
    const room = sdkRoom("!room:example.org");
    const parent = new MatrixEvent({ event_id: "$message", type: EventType.RoomMessage, room_id: room.roomId, sender: session.userId, content: { msgtype: "m.text", body: "Hi" }, origin_server_ts: 1 });
    const reaction = new MatrixEvent({ event_id: "$server-reaction", type: EventType.Reaction, room_id: room.roomId, sender: session.userId, content: { "m.relates_to": { rel_type: "m.annotation", event_id: "$message", key: "👍" } } });
    room.findEventById = id => id === "$message" ? parent : reaction;
    room.getLiveTimeline = () => ({ getEvents: () => [parent, reaction] }) as never;
    room.getUnfilteredTimelineSet = () => ({ relations: { getChildEventsForEvent: () => ({ getRelations: () => [reaction] }) } }) as never;
    rooms.push(room);
    const client = new MatrixJsSdkClient(); await client.start(session);
    const updated = vi.fn(); client.subscribe("messageUpdated", updated);
    const localEcho = sdk.on.mock.calls.find(([name]) => name === RoomEvent.LocalEchoUpdated)?.[1];
    localEcho?.(reaction, room, "~local");
    expect(updated).toHaveBeenLastCalledWith(expect.objectContaining({ id: "$message", reactions: [expect.objectContaining({ eventId: "$server-reaction" })] }));
    reaction.makeRedacted(new MatrixEvent({ type: EventType.RoomRedaction, redacts: "$server-reaction", content: {} }), room);
    const redacted = sdk.on.mock.calls.find(([name]) => name === RoomEvent.Redaction)?.[1];
    redacted?.(new MatrixEvent({ type: EventType.RoomRedaction, redacts: "$server-reaction", content: {} }), room);
    expect(updated).toHaveBeenLastCalledWith(expect.objectContaining({ id: "$message", reactions: [] }));
  });
  it("preserves other room pins when pinning and unpinning a message", async () => {
    const { sdk, rooms } = setup();
    const room = sdkRoom("!room:example.org");
    vi.spyOn(room.currentState, "maySendStateEvent").mockReturnValue(true);
    vi.spyOn(room.currentState, "getStateEvents").mockReturnValue(new MatrixEvent({ type: EventType.RoomPinnedEvents, state_key: "", content: { pinned: ["$other", "$message"] } }) as never);
    rooms.push(room);
    const client = new MatrixJsSdkClient(); await client.start(session);
    await client.setMessagePinned(room.roomId, "$message", true);
    expect(sdk.sendStateEvent).toHaveBeenLastCalledWith(room.roomId, EventType.RoomPinnedEvents, { pinned: ["$other", "$message"] }, "");
    await client.setMessagePinned(room.roomId, "$message", false);
    expect(sdk.sendStateEvent).toHaveBeenLastCalledWith(room.roomId, EventType.RoomPinnedEvents, { pinned: ["$other"] }, "");
  });
  it("does not send pin updates without room permission", async () => {
    const { sdk, rooms } = setup();
    rooms.push(sdkRoom("!room:example.org"));
    const client = new MatrixJsSdkClient(); await client.start(session);
    await expect(client.setMessagePinned(rooms[0].roomId, "$message", true)).rejects.toThrow("permission");
    expect(sdk.sendStateEvent).not.toHaveBeenCalled();
  });
  it("loads the signed-in profile and resolves its avatar to authenticated media", async () => {
    const { sdk } = setup();
    const client = new MatrixJsSdkClient(); await client.start(session);
    const profile = await client.getOwnProfile();
    expect(sdk.getProfileInfo).toHaveBeenCalledWith(session.userId);
    expect(profile).toMatchObject({ id: session.userId, displayName: "My display name" });
    expect(profile.avatarUrl).toContain("/_matrix/client/v1/media/thumbnail/example.org/my-avatar");
    expect(profile.avatarUrl).not.toContain(session.accessToken);
  });
  it("updates the timeline when an encrypted placeholder is decrypted later", async () => {
    const { sdk, rooms } = setup();
    rooms.push(sdkRoom("!room:example.org"));
    const client = new MatrixJsSdkClient(); await client.start(session);
    const updated = vi.fn(); client.subscribe("messageUpdated", updated);
    const decrypted = new MatrixEvent({ event_id: "$decrypted", room_id: "!room:example.org", sender: "@alice:example.org", origin_server_ts: 1,
      type: "m.room.message", content: { msgtype: "m.text", body: "Decrypted text" } });
    const listener = sdk.on.mock.calls.find(([event]) => event === MatrixEventEvent.Decrypted)?.[1];
    listener?.(decrypted);
    expect(updated).toHaveBeenCalledWith(expect.objectContaining({ id: "$decrypted", type: "text", body: "Decrypted text" }));
  });

  it("persists accepted direct invitations even after invite metadata disappears", async () => {
    const { sdk, rooms } = setup();
    rooms.push(sdkRoom("!invite:example.org", "invite", true));
    sdk.joinRoom.mockImplementationOnce(async () => { rooms[0] = sdkRoom("!invite:example.org"); return rooms[0]; });
    const client = new MatrixJsSdkClient(); await client.start(session);
    expect(await client.joinRoom("!invite:example.org")).toMatchObject({ membership: "join", isDirect: true });
    expect(sdk.setAccountData).toHaveBeenCalledWith(EventType.Direct, { "@alice:example.org": ["!invite:example.org"] });
  });

  it("waits for joined membership before completing acceptance", async () => {
    const { sdk, rooms } = setup();
    rooms.push(sdkRoom("!invite:example.org", "invite"));
    const client = new MatrixJsSdkClient(); await client.start(session);
    const accepted = client.joinRoom("!invite:example.org");
    await Promise.resolve();
    rooms[0] = sdkRoom("!invite:example.org", "join");
    const check = sdk.on.mock.calls.filter(([event]) => event === RoomEvent.MyMembership).at(-1)?.[1];
    check?.();
    expect(await accepted).toMatchObject({ id: "!invite:example.org", membership: "join" });
    expect(sdk.off).toHaveBeenCalledWith(RoomEvent.MyMembership, check);
    expect(sdk.off).toHaveBeenCalledWith(ClientEvent.Sync, check);
  });

  it("keeps incoming room, DM, and server invitations in the synced list", async () => {
    const { rooms } = setup();
    rooms.push(sdkRoom("!joined:example.org"), sdkRoom("!invite:example.org", "invite"), sdkRoom("!dm:example.org", "invite", true), sdkRoom("!space:example.org", "invite", false, true), sdkRoom("!left:example.org", "leave"));
    const client = new MatrixJsSdkClient(); await client.start(session);
    const result = client.getRooms();
    expect(result).toHaveLength(4);
    expect(result.find((room) => room.id === "!dm:example.org")).toMatchObject({ membership: "invite", isDirect: true });
    expect(result.find((room) => room.id === "!space:example.org")).toMatchObject({ membership: "invite", isSpace: true });
  });

  it("creates encrypted DMs, preserves other direct-room mappings, and reuses an existing conversation", async () => {
    const { sdk } = setup();
    await sdk.setAccountData(EventType.Direct, { "@bob:example.org": ["!bob:example.org"] });
    const client = new MatrixJsSdkClient(); await client.start(session);
    const created = await client.startDirectMessage(" @alice:example.org ");
    expect(created).toMatchObject({ id: "!new:example.org", isDirect: true, isEncrypted: true });
    expect(sdk.createRoom).toHaveBeenCalledWith(expect.objectContaining({
      invite: ["@alice:example.org"], is_direct: true, preset: Preset.TrustedPrivateChat,
      initial_state: [{ type: EventType.RoomEncryption, state_key: "", content: { algorithm: "m.megolm.v1.aes-sha2" } }],
    }));
    expect(sdk.setAccountData).toHaveBeenLastCalledWith(EventType.Direct, {
      "@bob:example.org": ["!bob:example.org"], "@alice:example.org": ["!new:example.org"],
    });
    expect((await client.startDirectMessage("@alice:example.org")).id).toBe(created.id);
    expect(sdk.createRoom).toHaveBeenCalledOnce();
  });

  it("sends invitations by Matrix ID and propagates permission failures", async () => {
    const { sdk } = setup();
    const client = new MatrixJsSdkClient(); await client.start(session);
    await client.inviteUser("!room:example.org", " @alice:example.org ");
    expect(sdk.invite).toHaveBeenCalledWith("!room:example.org", "@alice:example.org");
    sdk.invite.mockRejectedValueOnce(new Error("You do not have permission to invite"));
    await expect(client.inviteUser("!room:example.org", "@alice:example.org")).rejects.toThrow("permission");
    await expect(client.startDirectMessage(session.userId)).rejects.toThrow("yourself");
    await expect(client.inviteUser("!room:example.org", "alice")).rejects.toThrow("full Matrix ID");
  });

  it("searches the directory and excludes the current account", async () => {
    const { sdk } = setup();
    const client = new MatrixJsSdkClient(); await client.start(session);
    expect(await client.searchUsers(" Alice ")).toEqual([{ id: "@alice:example.org", displayName: "Alice", avatarUrl: null }]);
    expect(sdk.searchUserDirectory).toHaveBeenCalledWith({ term: "Alice", limit: 20 });
  });

  it("retries saving a created DM without creating a second room", async () => {
    const { sdk } = setup();
    sdk.setAccountData.mockRejectedValueOnce(new Error("Network offline"));
    const client = new MatrixJsSdkClient(); await client.start(session);
    await expect(client.startDirectMessage("@alice:example.org")).rejects.toThrow("Try Message again");
    expect((await client.startDirectMessage("@alice:example.org")).id).toBe("!new:example.org");
    expect(sdk.createRoom).toHaveBeenCalledOnce();
  });
});


it("refreshes message avatars after the SDK applies a membership state event", async () => {
  const { sdk, rooms } = setup();
  const room = sdkRoom("!avatar:example.org");
  let avatar = "mxc://example.org/old";
  const member = { name: "Slitix", getMxcAvatarUrl: () => avatar };
  const message = new MatrixEvent({ event_id: "$avatar-message", room_id: room.roomId, sender: "@slitix:example.org", type: "m.room.message", content: { msgtype: "m.text", body: "Hello" } });
  room.getMember = vi.fn(() => member) as unknown as Room["getMember"];
  room.getLiveTimeline = (() => ({ getState: () => ({ getStateEvents: () => undefined }), getEvents: () => [message] })) as unknown as Room["getLiveTimeline"];
  rooms.push(room);
  const client = new MatrixJsSdkClient(); await client.start(session);
  const sync = sdk.on.mock.calls.find(([event]) => event === ClientEvent.Sync)?.[1];
  sync?.(SyncState.Prepared);
  const updated = vi.fn(); client.subscribe("messageUpdated", updated);
  const state = sdk.on.mock.calls.find(([event]) => event === RoomStateEvent.Events)?.[1];
  state?.(new MatrixEvent({ type: "m.room.member", state_key: "@slitix:example.org", content: { avatar_url: "mxc://example.org/new" } }), { roomId: room.roomId });
  // This is the order used by matrix-js-sdk's RoomState.setStateEvents.
  avatar = "mxc://example.org/new";
  expect(updated).not.toHaveBeenCalled();
  await vi.waitFor(() => expect(updated).toHaveBeenCalled());
  expect(updated.mock.calls[0][0].sender.avatarUrl).toContain("/thumbnail/example.org/new");
});
