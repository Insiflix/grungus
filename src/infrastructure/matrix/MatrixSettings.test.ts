import { membershipNotices } from "../../domain/matrix/MembershipNotices";
import { describe, expect, it, vi } from "vitest";
import { EventType, MatrixError, MatrixEvent, RoomState, PushRuleKind, Visibility, type MatrixClient } from "matrix-js-sdk";
import { MatrixSettings, SettingsAuthRequired } from "./MatrixSettings";

function fixture() {
  const sdk = {
    getUserId: () => "@me:example.org", getDeviceId: () => "CURRENT",
    setDisplayName: vi.fn().mockResolvedValue({}), setAvatarUrl: vi.fn().mockResolvedValue({}),
    uploadContent: vi.fn().mockResolvedValue({ content_uri: "mxc://example.org/avatar" }),
    setPassword: vi.fn().mockResolvedValue({}), deleteDevice: vi.fn().mockResolvedValue({}),
    addThreePidOnly: vi.fn().mockResolvedValue({}),
    setPusher: vi.fn().mockResolvedValue({}), removePusher: vi.fn().mockResolvedValue({}),
    submitMsisdnTokenOtherUrl: vi.fn().mockResolvedValue({ success: true }),
    getAccountDataFromServer: vi.fn().mockResolvedValue({ ignored_users: { "@old:example.org": {} } }),
    setIgnoredUsers: vi.fn().mockResolvedValue({}),
    getPushRules: vi.fn().mockResolvedValue({ global: { override: [], underride: [".m.rule.message", ".m.rule.encrypted", ".m.rule.room_one_to_one", ".m.rule.encrypted_room_one_to_one"].map((rule_id) => ({ rule_id, enabled: true, actions: ["notify"] })) } }),
    setPushRules: vi.fn(), setPushRuleEnabled: vi.fn().mockResolvedValue({}),
    addPushRule: vi.fn().mockResolvedValue({}), deletePushRule: vi.fn().mockResolvedValue({}),
    createRoom: vi.fn().mockResolvedValue({ room_id: "!new:example.org" }),
    getStateEvent: vi.fn().mockResolvedValue({ users: { "@me:example.org": 100, "@other:example.org": 50 }, events: { "m.room.name": 75 }, invite: 25, ban: 50 }),
    sendStateEvent: vi.fn().mockResolvedValue({}),
    getRoomIdForAlias: vi.fn().mockResolvedValue({ room_id: "!different:example.org" }),
    deleteAlias: vi.fn(),
    getCrypto: vi.fn(() => ({ exportRoomKeysAsJson: vi.fn().mockResolvedValue("[]"), importRoomKeysAsJson: vi.fn().mockResolvedValue(undefined) })),
  };
  const profileChanged = vi.fn().mockResolvedValue(undefined);
  return { sdk, profileChanged, settings: new MatrixSettings(() => sdk as unknown as MatrixClient, profileChanged) };
}

describe("Matrix account settings", () => {
  it("does not apply an old account's blocked-user request to a newly connected account", async () => {
    const first = fixture().sdk, second = fixture().sdk;
    let current = first;
    const settings = new MatrixSettings(() => current as unknown as MatrixClient, async () => undefined);
    let finish!: (value: { ignored_users: Record<string, object> }) => void;
    first.getAccountDataFromServer.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const blocking = settings.setIgnored("@blocked:example.org", true);
    current = second;
    finish({ ignored_users: {} });
    await expect(blocking).rejects.toThrow("changed");
    expect(first.setIgnoredUsers).not.toHaveBeenCalled();
    expect(second.setIgnoredUsers).not.toHaveBeenCalled();
  });
  it("creates server channels that members can join and links them to the space", async () => {
    const { sdk, settings } = fixture();
    sdk.getStateEvent.mockResolvedValue({ join_rule: "restricted", allow: [{ type: "m.room_membership", room_id: "!server:example.org" }] } as never);
    Object.assign(sdk, { getDomain: () => "example.org", getRoom: () => ({ currentState: { maySendStateEvent: () => true } }) });
    await settings.createSpaceChannel("!server:example.org", " Lounge ", true);
    expect(sdk.createRoom).toHaveBeenCalledWith(expect.objectContaining({ name: "Lounge", creation_content: { type: "org.matrix.msc3417.call" }, initial_state: expect.arrayContaining([
      { type: "m.room.join_rules", state_key: "", content: { join_rule: "restricted", allow: [{ type: "m.room_membership", room_id: "!server:example.org" }] } },
      { type: "m.space.parent", state_key: "!server:example.org", content: { via: ["example.org"], canonical: true } },
      { type: "m.room.encryption", state_key: "", content: { algorithm: "m.megolm.v1.aes-sha2" } },
    ]) }));
    expect(sdk.sendStateEvent).toHaveBeenCalledWith("!server:example.org", "m.space.child", { via: ["example.org"], suggested: true }, "!new:example.org");
  });
  it.each(["public", "private", "invite"] as const)("creates text and voice channels with %s access", async access => {
    const { sdk, settings } = fixture();
    sdk.getStateEvent.mockResolvedValue((access === "private" ? { join_rule: "restricted", allow: [{ type: "m.room_membership", room_id: "!server:example.org" }] } : { join_rule: access }) as never);
    Object.assign(sdk, { getDomain: () => "example.org", getRoom: () => ({ currentState: { maySendStateEvent: () => true } }) });
    for (const voice of [false, true]) {
      await settings.createSpaceChannel("!server:example.org", "Channel", voice, access);
      const options = vi.mocked(sdk.createRoom).mock.calls.at(-1) as unknown as [Record<string, unknown>];
      expect(options[0]).toMatchObject({
        visibility: access === "public" ? Visibility.Public : Visibility.Private,
        creation_content: voice ? { type: "org.matrix.msc3417.call" } : {},
        power_level_content_override: { events: { "org.matrix.msc3401.call.member": 0, "m.call.member": 0 } },
        initial_state: expect.arrayContaining([{ type: "m.room.join_rules", state_key: "", content: access === "private" ? { join_rule: "restricted", allow: [{ type: "m.room_membership", room_id: "!server:example.org" }] } : { join_rule: access } }]),
      });
      // Joining the room is separate from permission to publish call membership.
      // Exercise the SDK's permission check with a regular member and the room defaults.
      const state = new RoomState("!new:example.org");
      const override = options[0].power_level_content_override as { events: Record<string, number> };
      state.setStateEvents([
        new MatrixEvent({ room_id: "!new:example.org", type: EventType.RoomMember, state_key: "@member:example.org", content: { membership: "join" } }),
        new MatrixEvent({ room_id: "!new:example.org", type: EventType.RoomPowerLevels, state_key: "", content: { users_default: 0, state_default: 50, ...override } }),
      ]);
      expect(state.maySendStateEvent("org.matrix.msc3401.call.member", "@member:example.org")).toBe(true);
      expect(state.maySendStateEvent("m.call.member", "@member:example.org")).toBe(true);
      expect(state.maySendStateEvent(EventType.RoomPowerLevels, "@member:example.org")).toBe(false);
    }
  });
  it("checks server permissions before creating a room and preserves recovery details if linking fails", async () => {
    const { sdk, settings } = fixture();
    sdk.getStateEvent.mockResolvedValue({ join_rule: "restricted", allow: [{ type: "m.room_membership", room_id: "!server:example.org" }] } as never);
    const maySendStateEvent = vi.fn(() => false);
    Object.assign(sdk, { getDomain: () => "example.org", getRoom: () => ({ currentState: { maySendStateEvent } }) });
    await expect(settings.createSpaceChannel("!server:example.org", "General", false)).rejects.toThrow("Your role");
    expect(sdk.createRoom).not.toHaveBeenCalled();
    maySendStateEvent.mockReturnValue(true);
    sdk.sendStateEvent.mockRejectedValueOnce(new Error("Forbidden"));
    await expect(settings.createSpaceChannel("!server:example.org", "General", false)).rejects.toThrow("!new:example.org");
    expect(sdk.createRoom).toHaveBeenCalledWith(expect.objectContaining({ initial_state: expect.arrayContaining([{ type: "m.room.encryption", state_key: "", content: { algorithm: "m.megolm.v1.aes-sha2" } }]) }));
  });
  it("repairs invitation-only access before publishing a channel created as public", async () => {
    const { sdk, settings } = fixture();
    Object.assign(sdk, { getDomain: () => "example.org", getRoom: () => ({ currentState: { maySendStateEvent: () => true } }) });
    sdk.getStateEvent.mockResolvedValueOnce({ join_rule: "invite" } as never).mockResolvedValueOnce({ join_rule: "public" } as never);
    await settings.createSpaceChannel("!server:example.org", "Public voice", true, "public");
    expect(sdk.sendStateEvent).toHaveBeenNthCalledWith(1, "!new:example.org", EventType.RoomJoinRules, { join_rule: "public" }, "");
    expect(sdk.sendStateEvent).toHaveBeenNthCalledWith(2, "!server:example.org", EventType.SpaceChild, expect.anything(), "!new:example.org");
  });
  it("reports the created room ID and avoids listing it if the server keeps invite-only access", async () => {
    const { sdk, settings } = fixture();
    Object.assign(sdk, { getDomain: () => "example.org", getRoom: () => ({ currentState: { maySendStateEvent: () => true } }) });
    sdk.getStateEvent.mockResolvedValue({ join_rule: "invite" } as never);
    await expect(settings.createSpaceChannel("!server:example.org", "Public voice", true, "public")).rejects.toThrow("Channel created (!new:example.org), but its access could not be verified");
    expect(sdk.sendStateEvent).toHaveBeenCalledOnce();
    expect(sdk.sendStateEvent).toHaveBeenCalledWith("!new:example.org", EventType.RoomJoinRules, { join_rule: "public" }, "");
  });
  it("publishes profile changes only after the homeserver accepts them", async () => {
    const { sdk, settings, profileChanged } = fixture();
    await settings.profile("  Alice  ");
    expect(sdk.setDisplayName).toHaveBeenCalledWith("Alice");
    expect(profileChanged).toHaveBeenCalledOnce();
    sdk.setDisplayName.mockRejectedValueOnce(new Error("Forbidden"));
    await expect(settings.profile("Bob")).rejects.toThrow("Forbidden");
    expect(profileChanged).toHaveBeenCalledOnce();
  });
  it("removes avatars without uploading a file", async () => {
    const { sdk, settings } = fixture();
    await settings.avatar(null);
    expect(sdk.setAvatarUrl).toHaveBeenCalledWith("");
    expect(sdk.uploadContent).not.toHaveBeenCalled();
  });
  it("preserves UI authentication challenges for password and session operations", async () => {
    const { sdk, settings } = fixture();
    const data = { session: "auth-session", flows: [{ stages: ["m.login.password"] }] };
    sdk.deleteDevice.mockRejectedValueOnce(new MatrixError(data, 401));
    await expect(settings.revokeDevice("OLD")).rejects.toMatchObject({ challenge: data });
    const auth = { type: "m.login.password", session: "auth-session", password: "secret" };
    await settings.revokeDevice("OLD", auth);
    expect(sdk.deleteDevice).toHaveBeenLastCalledWith("OLD", auth);
    sdk.setPassword.mockRejectedValueOnce(new MatrixError(data, 401));
    await expect(settings.password("new-secret", false)).rejects.toBeInstanceOf(SettingsAuthRequired);
  });
  it("does not revoke the current session through the other-device endpoint", async () => {
    const { sdk, settings } = fixture();
    await expect(settings.revokeDevice("CURRENT")).rejects.toThrow("Use Sign out");
    expect(sdk.deleteDevice).not.toHaveBeenCalled();
  });
  it("merges blocks against server account data and rejects invalid IDs", async () => {
    const { sdk, settings } = fixture();
    await settings.setIgnored("@new:example.org", true);
    expect(sdk.getAccountDataFromServer).toHaveBeenCalledWith(EventType.IgnoredUserList);
    expect(sdk.setIgnoredUsers).toHaveBeenCalledWith(["@old:example.org", "@new:example.org"]);
    await settings.setIgnored("@old:example.org", false);
    expect(sdk.setIgnoredUsers).toHaveBeenLastCalledWith([]);
    await expect(settings.setIgnored("@me:example.org", true)).rejects.toThrow("yourself");
    await expect(settings.setIgnored("invalid", true)).rejects.toThrow("full Matrix ID");
  });
  it("sets account notification rules without replacing mention and room overrides", async () => {
    const { sdk, settings } = fixture();
    await settings.setMessageNotifications("mentions");
    expect(sdk.setPushRuleEnabled).toHaveBeenCalledWith("global", PushRuleKind.Underride, ".m.rule.encrypted", false);
    expect(sdk.setPushRuleEnabled).toHaveBeenCalledWith("global", PushRuleKind.Underride, ".m.rule.room_one_to_one", false);
    expect(sdk.addPushRule).not.toHaveBeenCalled();
    expect(sdk.setPushRuleEnabled).toHaveBeenLastCalledWith("global", PushRuleKind.Override, ".m.rule.master", false);
    expect(sdk.setPushRules).toHaveBeenCalled();
    await settings.setMessageNotifications("off");
    expect(sdk.setPushRuleEnabled).toHaveBeenLastCalledWith("global", PushRuleKind.Override, ".m.rule.master", true);
  });
  it("rejects malformed key imports before calling crypto", async () => {
    const { settings } = fixture();
    await expect(settings.importKeys('{"access_token":"bad"}')).rejects.toThrow("Matrix room keys");
  });
  it("adds and removes email pushers using the standard email app ID", async () => {
    const { sdk, settings } = fixture();
    await settings.emailNotifications("me@example.org", true);
    expect(sdk.setPusher).toHaveBeenCalledWith(expect.objectContaining({ kind: "email", app_id: "m.email", pushkey: "me@example.org" }));
    await settings.emailNotifications("me@example.org", false);
    expect(sdk.removePusher).toHaveBeenCalledWith("me@example.org", "m.email");
  });
  it("validates SMS codes without accepting insecure verification endpoints", async () => {
    const { sdk, settings } = fixture();
    await expect(settings.verifyPhone("http://example.org/verify", "sid", "secret", "1234")).rejects.toThrow("insecure");
    expect(sdk.submitMsisdnTokenOtherUrl).not.toHaveBeenCalled();
    await settings.verifyPhone("https://example.org/verify", "sid", "secret", "1234");
    expect(sdk.submitMsisdnTokenOtherUrl).toHaveBeenCalledWith("https://example.org/verify", "sid", "secret", "1234");
  });
});

describe("Matrix room and space administration", () => {
  it("uses fresh server state and modern creator permissions instead of stale room caches", async () => {
    const { sdk, settings } = fixture();
    const roomId = "!room:example.org";
    const events = [
      { type: EventType.RoomCreate, state_key: "", content: { room_version: "12" } },
      { type: EventType.RoomMember, state_key: "@me:example.org", content: { membership: "join", displayname: "Me" } },
      { type: EventType.RoomName, state_key: "", content: { name: "Fresh server name" } },
      { type: EventType.RoomPowerLevels, state_key: "", content: { users: {}, state_default: 50 } },
    ].map((event, index) => ({ ...event, room_id: roomId, sender: "@me:example.org", event_id: `$state${index}`, origin_server_ts: index }));
    Object.assign(sdk, {
      getRoom: () => ({ name: "Stale cached name", getMyMembership: () => "join", isSpaceRoom: () => false }),
      roomState: vi.fn().mockResolvedValue(events), getLocalAliases: vi.fn().mockResolvedValue({ aliases: [] }),
      getRoomDirectoryVisibility: vi.fn().mockResolvedValue({ visibility: "private" }),
    });
    const room = await settings.room(roomId);
    expect(room.name).toBe("Fresh server name");
    expect(room.canDetails).toBe(true);
    expect(room.level).toBeGreaterThan(100);
  });
  it("preserves other members and event thresholds when changing a role", async () => {
    const { sdk, settings } = fixture();
    await settings.roomPermission("!room:example.org", "users", 25, "@new:example.org");
    expect(sdk.sendStateEvent).toHaveBeenCalledWith("!room:example.org", EventType.RoomPowerLevels, {
      users: { "@me:example.org": 100, "@other:example.org": 50, "@new:example.org": 25 },
      events: { "m.room.name": 75 }, invite: 25, ban: 50,
    }, "");
  });
  it("repairs call permissions only in the explicitly selected room and preserves other thresholds", async () => {
    const { sdk, settings } = fixture();
    Object.assign(sdk, { getRoom: () => ({ getMyMembership: () => "join", currentState: { maySendStateEvent: () => true } }) });
    await settings.allowMemberCalls("!voice:example.org");
    expect(sdk.getStateEvent).toHaveBeenCalledWith("!voice:example.org", EventType.RoomPowerLevels, "");
    expect(sdk.sendStateEvent).toHaveBeenCalledExactlyOnceWith("!voice:example.org", EventType.RoomPowerLevels, {
      users: { "@me:example.org": 100, "@other:example.org": 50 },
      events: { "m.room.name": 75, "org.matrix.msc3401.call.member": 0, "m.call.member": 0 }, invite: 25, ban: 50,
    }, "");
  });
  it("does not attempt to repair call permissions as an ordinary member", async () => {
    const { sdk, settings } = fixture();
    Object.assign(sdk, { getRoom: () => ({ getMyMembership: () => "join", currentState: { maySendStateEvent: () => false } }) });
    await expect(settings.allowMemberCalls("!voice:example.org")).rejects.toThrow("administrator");
    expect(sdk.sendStateEvent).not.toHaveBeenCalled();
  });
  it("validates space-restricted access and writes the allowed-room membership rules", async () => {
    const { sdk, settings } = fixture();
    await expect(settings.roomAccess("!room:example.org", "restricted", [])).rejects.toThrow("valid space ID");
    expect(sdk.sendStateEvent).not.toHaveBeenCalled();
    await settings.roomAccess("!room:example.org", "restricted", ["!space:example.org"]);
    expect(sdk.sendStateEvent).toHaveBeenCalledWith("!room:example.org", EventType.RoomJoinRules, { join_rule: "restricted", allow: [{ type: "m.room_membership", room_id: "!space:example.org" }] }, "");
  });
  it("does not make an address primary if it points to another room", async () => {
    const { sdk, settings } = fixture();
    await expect(settings.roomAlias("!room:example.org", "#other:example.org", "primary")).rejects.toThrow("does not point");
    expect(sdk.sendStateEvent).not.toHaveBeenCalled();
  });
  it("creates encrypted rooms and unencrypted space containers", async () => {
    const { sdk, settings } = fixture();
    await settings.createRoom(" Private room ", false, true, false);
    expect(sdk.createRoom).toHaveBeenCalledWith(expect.objectContaining({ power_level_content_override: { events: { "org.matrix.msc3401.call.member": 0, "m.call.member": 0 } } }));
    expect(sdk.createRoom).toHaveBeenCalledWith(expect.objectContaining({ name: "Private room", visibility: Visibility.Private, initial_state: [{ type: EventType.RoomEncryption, state_key: "", content: { algorithm: "m.megolm.v1.aes-sha2" } }] }));
    await settings.createRoom("Space", true, true, true);
    expect(sdk.createRoom).toHaveBeenLastCalledWith(expect.objectContaining({ creation_content: { type: "m.space" }, initial_state: [] }));
  });
  it("removes space children without deleting or leaving their rooms", async () => {
    const { sdk, settings } = fixture();
    await settings.spaceChild("!space:example.org", "!child:example.org", true);
    expect(sdk.sendStateEvent).toHaveBeenCalledWith("!space:example.org", EventType.SpaceChild, {}, "!child:example.org");
    await expect(settings.spaceChild("!space:example.org", "!space:example.org")).rejects.toThrow("another room");
  });
  it("keeps unrelated account rules when muting a room", async () => {
    const { sdk, settings } = fixture();
    await settings.roomNotifications("!room:example.org", "off");
    expect(sdk.addPushRule).toHaveBeenCalledWith("global", PushRuleKind.Override, "dev.grungus.mute.!room:example.org", {
      conditions: [{ kind: "event_match", key: "room_id", pattern: "!room:example.org" }], actions: [],
    });
    expect(sdk.deletePushRule).not.toHaveBeenCalled();
    expect(sdk.setPushRuleEnabled).not.toHaveBeenCalled();
  });
  it("does not overwrite room addresses when reading current canonical state fails", async () => {
    const { sdk, settings } = fixture();
    sdk.getStateEvent.mockRejectedValueOnce(new Error("Offline"));
    await expect(settings.roomAlias("!room:example.org", "#forest:example.org", "remove")).rejects.toThrow("Offline");
    expect(sdk.sendStateEvent).not.toHaveBeenCalled();
    expect(sdk.deleteAlias).not.toHaveBeenCalled();
  });
});

describe("membership leave notifications", () => {
  it.each([false, true])("publishes successful departures with space=%s", async isSpace => {
    membershipNotices.clear();
    const { sdk, settings } = fixture();
    Object.assign(sdk, { leave: vi.fn().mockResolvedValue({}), getRoom: () => ({ name: "The Pond", getMyMembership: () => "join", isSpaceRoom: () => isSpace }) });
    await settings.leaveRoom("!pond:example.org");
    expect(membershipNotices.getSnapshot()).toMatchObject({ action: "leave", kind: isSpace ? "space" : "room", name: "The Pond" });
    membershipNotices.clear();
  });
  it("does not announce failed departures or declined invitations", async () => {
    membershipNotices.clear();
    const { sdk, settings } = fixture();
    const leave = vi.fn().mockRejectedValueOnce(new Error("Offline")).mockResolvedValue({});
    Object.assign(sdk, { leave, getRoom: () => ({ name: "Invitation", getMyMembership: () => "invite", isSpaceRoom: () => false }) });
    await expect(settings.leaveRoom("!room:example.org")).rejects.toThrow("Offline");
    expect(membershipNotices.getSnapshot()).toBeNull();
    await settings.leaveRoom("!room:example.org");
    expect(membershipNotices.getSnapshot()).toBeNull();
  });
});

describe("server deletion", () => {
  function deletionFixture() {
    const { sdk, settings } = fixture();
    Object.assign(sdk, { getRoom: () => ({ isSpaceRoom: () => true }), kick: vi.fn().mockResolvedValue({}), leave: vi.fn().mockResolvedValue({}) });
    const room = { id: "!server:example.org", name: "Forest", space: true, ownId: "@me:example.org", level: 100, power: { users: { "@me:example.org": 100 }, events: { "m.room.message": 0 } }, canPermissions: true, canAccess: true, canGuestAccess: true, canKick: true, canChildren: true, members: [{ id: "@me:example.org", name: "Me", level: 100, membership: "join" }, { id: "@other:example.org", name: "Alice", level: 0, membership: "join" }], children: [{ id: "!channel:example.org", name: "General" }] };
    const child = { ...room, id: "!channel:example.org", name: "General", space: false, children: [] };
    vi.spyOn(settings, "room").mockImplementation(async id => (id === room.id ? room : child) as unknown as Awaited<ReturnType<typeof settings.room>>);
    const leave = vi.spyOn(settings, "leaveRoom").mockResolvedValue(undefined);
    return { sdk: sdk as typeof sdk & { kick: ReturnType<typeof vi.fn> }, settings, room, child, leave };
  }
  it("closes every channel, removes members, unlinks children, and leaves the server last", async () => {
    const f = deletionFixture();
    await f.settings.deleteServer(f.room.id);
    expect(f.sdk.sendStateEvent).toHaveBeenCalledWith(f.child.id, "m.room.join_rules", { join_rule: "invite" }, "");
    expect(f.sdk.sendStateEvent).toHaveBeenCalledWith(f.child.id, "m.room.power_levels", expect.objectContaining({ users_default: -1, events_default: 100, invite: 100, events: { "m.room.message": 100 } }), "");
    expect(f.sdk.kick).toHaveBeenCalledWith(f.child.id, "@other:example.org", expect.any(String));
    expect(f.sdk.sendStateEvent).toHaveBeenCalledWith(f.room.id, "m.space.child", {}, f.child.id);
    expect(f.leave.mock.calls).toEqual([[f.child.id], [f.room.id]]);
  });
  it("refuses the entire deletion before any mutation if a channel cannot be managed", async () => {
    const f = deletionFixture(); f.child.canKick = false;
    await expect(f.settings.deleteServer(f.room.id)).rejects.toThrow("permission");
    expect(f.sdk.sendStateEvent).not.toHaveBeenCalled(); expect(f.sdk.kick).not.toHaveBeenCalled(); expect(f.leave).not.toHaveBeenCalled();
  });
  it("refuses to remove an administrator with equal power", async () => {
    const f = deletionFixture(); f.child.members[1].level = 100;
    await expect(f.settings.deleteServer(f.room.id)).rejects.toThrow("permission");
    expect(f.sdk.sendStateEvent).not.toHaveBeenCalled();
  });
  it("does not leave rooms after a failed member removal", async () => {
    const f = deletionFixture(); f.sdk.kick.mockRejectedValueOnce(new Error("Forbidden"));
    await expect(f.settings.deleteServer(f.room.id)).rejects.toThrow("Deletion stopped");
    expect(f.leave).not.toHaveBeenCalled();
  });
});

describe("server invite permissions", () => {
  function inviteFixture(level: number, required = 50, targetMembership?: string) {
    const { sdk, settings } = fixture();
    // Real /state responses may omit room_id and must still be evaluated.
    const events = [
      { type: EventType.RoomCreate, state_key: "", sender: "@owner:example.org", content: { room_version: "11", creator: "@owner:example.org" } },
      { type: EventType.RoomPowerLevels, state_key: "", content: { invite: required, users: { "@me:example.org": level } } },
      { type: EventType.RoomMember, state_key: "@me:example.org", content: { membership: "join" } },
      ...(targetMembership ? [{ type: EventType.RoomMember, state_key: "@target:example.org", content: { membership: targetMembership } }] : []),
    ];
    const roomState = vi.fn().mockResolvedValue(events);
    Object.assign(sdk, { getRoom: () => ({ getMyMembership: () => "join" }), roomState });
    return { sdk, settings, events, roomState };
  }
  it.each([[0, false], [49, false], [50, true], [100, true]])("compares power level %s against the server invite threshold", async (level, expected) => {
    const f = inviteFixture(level as number);
    expect(await f.settings.canInviteToRoom("!server:example.org", "@target:example.org")).toBe(expected);
  });
  it.each(["join", "invite", "ban"])("omits targets who are already %s", async membership => {
    const f = inviteFixture(100, 50, membership);
    expect(await f.settings.canInviteToRoom("!server:example.org", "@target:example.org")).toBe(false);
  });
  it("uses refreshed power levels rather than an earlier permission result", async () => {
    const f = inviteFixture(50);
    expect(await f.settings.canInviteToRoom("!server:example.org", "@target:example.org")).toBe(true);
    f.events[1].content = { invite: 100, users: { "@me:example.org": 50 } };
    expect(await f.settings.canInviteToRoom("!server:example.org", "@target:example.org")).toBe(false);
  });
  it("requires a confirmed joined membership in the fresh state", async () => {
    const f = inviteFixture(100);
    f.roomState.mockResolvedValue(f.events.filter(event => event.type !== EventType.RoomMember));
    expect(await f.settings.canInviteToRoom("!server:example.org", "@target:example.org")).toBe(false);
  });
  it("does not load unrelated settings endpoints to determine invite permissions", async () => {
    const f = inviteFixture(100);
    await f.settings.canInviteToRoom("!server:example.org", "@target:example.org");
    expect(f.sdk.getStateEvent).not.toHaveBeenCalled();
    expect(f.roomState).toHaveBeenCalledExactlyOnceWith("!server:example.org");
  });
});
