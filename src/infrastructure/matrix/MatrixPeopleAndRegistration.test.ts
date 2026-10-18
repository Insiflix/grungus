import { beforeEach, describe, expect, it, vi } from "vitest";
import { ClientEvent, createClient, EventType, MatrixEvent, MatrixEventEvent, Preset, RoomEvent, SSOAction, type MatrixClient, type Room } from "matrix-js-sdk";
import type { MatrixAuthCapabilities, MatrixSession } from "../../domain/matrix/MatrixTypes";
import { MatrixAuthProvider } from "./MatrixAuthProvider";
import { MatrixJsSdkClient } from "./MatrixJsSdkClient";

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
    getDMInviter: () => direct ? "@alice:example.org" : undefined,
    isSpaceRoom: () => space,
    getLiveTimeline: () => ({ getState: () => ({ getStateEvents: (type: string) => type === EventType.SpaceChild ? [] : undefined }) }),
    getMxcAvatarUrl: () => null, getUnreadNotificationCount: () => 0,
    hasEncryptionStateEvent: () => true, getJoinedMemberCount: () => 2,
    getMember: () => null,
    getUnfilteredTimelineSet: () => ({ relations: { getChildEventsForEvent: () => undefined } }),
  } as unknown as Room;
}

function setup() {
  const rooms: Room[] = [];
  let direct: Record<string, string[]> = {};
  const sdk = {
    on: vi.fn(), off: vi.fn(), initRustCrypto: vi.fn(), startClient: vi.fn(),
    getRooms: () => rooms, getRoom: (id: string) => rooms.find((room) => room.roomId === id),
    getUserId: () => session.userId,
    getHomeserverUrl: () => session.homeserverUrl,
    getProfileInfo: vi.fn(async () => ({ displayname: "My display name", avatar_url: "mxc://example.org/my-avatar" })),
    getAccountData: () => ({ getContent: () => direct }),
    setAccountData: vi.fn(async (_type: string, value: Record<string, string[]>) => { direct = value; }),
    createRoom: vi.fn(async () => { const room = sdkRoom("!new:example.org"); rooms.push(room); return { room_id: room.roomId }; }),
    invite: vi.fn(async () => ({})),
    joinRoom: vi.fn(async (id: string) => rooms.find((room) => room.roomId === id)!),
    leave: vi.fn(async () => ({})),
    searchUserDirectory: vi.fn(async () => ({ results: [
      { user_id: session.userId, display_name: "Me" },
      { user_id: "@alice:example.org", display_name: "Alice" },
    ] })),
    registerRequest: vi.fn(),
    getSsoLoginUrl: vi.fn(() => "https://matrix.example.org/sso"),
  };
  vi.mocked(createClient).mockReturnValue(sdk as unknown as MatrixClient);
  return { sdk, rooms };
}

beforeEach(() => vi.clearAllMocks());

describe("registration", () => {
  it("requests browser registration rather than login for SSO signup", async () => {
    const { sdk } = setup();
    const openExternal = vi.fn();
    vi.stubGlobal("window", { desktop: { auth: { openExternal } } });
    try {
      await new MatrixAuthProvider().startBrowserLogin({ ...capabilities, browser: true }, { register: true });
      expect(sdk.getSsoLoginUrl).toHaveBeenCalledWith("grungus-matrix://auth/callback", "sso", undefined, SSOAction.REGISTER);
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
