import { describe, expect, it, vi } from "vitest";
import { createClient, MatrixEvent, Room, RoomMember, type MatrixClient } from "matrix-js-sdk";
import { MatrixProfileAvatars } from "./MatrixProfileAvatars";
import { MatrixMessageMapper } from "./MatrixMessageMapper";
import { MatrixRoomMapper } from "./MatrixRoomMapper";

function setup() {
  const client = createClient({ baseUrl: "https://matrix.example.org", userId: "@me:example.org" });
  const request = vi.spyOn(client, "getProfileInfo").mockResolvedValue({ avatar_url: "mxc://example.org/slitix" });
  const updated = vi.fn();
  const profiles = new MatrixProfileAvatars(client, updated);
  const member = new RoomMember("!dm:example.org", "@slitix:example.org");
  member.setMembershipEvent(new MatrixEvent({ type: "m.room.member", state_key: member.userId, content: { membership: "join", displayname: "slitix" } }));
  return { client, request, updated, profiles, member };
}

describe("profile avatar fallback", () => {
  it("resolves a missing own display name from the global profile without showing the full Matrix ID", async () => {
    const { client, profiles, request, updated } = setup();
    request.mockResolvedValueOnce({ displayname: "Jukodev" });
    const room = new Room("!dm:example.org", client, "@me:example.org");
    const event = new MatrixEvent({ event_id: "$own", sender: "@me:example.org", type: "m.room.message", content: { msgtype: "m.text", body: "Hello" } });
    const mapper = new MatrixMessageMapper(client, profiles);
    expect(mapper.map(event, room)?.sender.displayName).toBe("me");
    await vi.waitFor(() => expect(updated).toHaveBeenCalledWith("@me:example.org"));
    expect(mapper.map(event, room)?.sender.displayName).toBe("Jukodev");
    expect(request).toHaveBeenCalledExactlyOnceWith("@me:example.org");
  });

  it("preserves room-specific names and uses an SDK profile name when room membership is missing", () => {
    const { profiles, member, client, request } = setup();
    vi.spyOn(client, "getUser").mockReturnValue({ displayName: "Global name" } as ReturnType<MatrixClient["getUser"]>);
    expect(profiles.displayName(member, member.userId)).toBe("slitix");
    expect(profiles.displayName(null, member.userId)).toBe("Global name");
    expect(request).not.toHaveBeenCalled();
  });
  it("fetches a missing room avatar once and exposes it to both messages and DMs", async () => {
    const { client, request, updated, profiles, member } = setup();
    const room = new Room(member.roomId, client, "@me:example.org");
    vi.spyOn(room, "getMember").mockReturnValue(member);
    vi.spyOn(room, "getAvatarFallbackMember").mockReturnValue(member);
    const event = new MatrixEvent({ event_id: "$message", sender: member.userId, type: "m.room.message", content: { msgtype: "m.text", body: "Hello" } });
    const messages = new MatrixMessageMapper(client, profiles);
    const rooms = new MatrixRoomMapper(client, profiles);
    expect(messages.map(event, room)?.sender.avatarUrl).toBeNull();
    expect(rooms.map(room).avatarUrl).toBeNull();
    await vi.waitFor(() => expect(updated).toHaveBeenCalledWith(member.userId));
    expect(request).toHaveBeenCalledExactlyOnceWith(member.userId);
    expect(messages.map(event, room)?.sender.avatarUrl).toContain("/thumbnail/example.org/slitix");
    expect(rooms.map(room).avatarUrl).toContain("/thumbnail/example.org/slitix");
    expect(rooms.mapMember(member).avatarUrl).toContain("/thumbnail/example.org/slitix");
  });


  it("loads the m.direct peer avatar when SDK room-size heuristics provide no fallback", async () => {
    const { client, profiles, member, updated, request } = setup();
    const room = new Room(member.roomId, client, "@me:example.org");
    vi.spyOn(client, "getAccountData").mockReturnValue(new MatrixEvent({ type: "m.direct", content: { [member.userId]: [room.roomId] } }));
    vi.spyOn(room, "getAvatarFallbackMember").mockReturnValue(undefined);
    const mapper = new MatrixRoomMapper(client, profiles);
    expect(mapper.map(room).avatarUrl).toBeNull();
    await vi.waitFor(() => expect(updated).toHaveBeenCalledWith(member.userId));
    expect(mapper.map(room).avatarUrl).toContain("/thumbnail/example.org/slitix");
    expect(request).toHaveBeenCalledExactlyOnceWith(member.userId);
  });

  it("preserves room-specific avatars and explicit avatar removals", () => {
    const { profiles, member, request } = setup();
    for (const avatar of ["mxc://example.org/room-avatar", ""]) {
      member.setMembershipEvent(new MatrixEvent({ type: "m.room.member", state_key: member.userId, content: { membership: "join", avatar_url: avatar } }));
      expect(profiles.resolve(member, member.userId)).toBe(avatar || undefined);
    }
    expect(request).not.toHaveBeenCalled();
  });

  it("uses an SDK user avatar without an extra profile request", () => {
    const { profiles, member, client, request } = setup();
    vi.spyOn(client, "getUser").mockReturnValue({ avatarUrl: "mxc://example.org/known" } as ReturnType<MatrixClient["getUser"]>);
    expect(profiles.resolve(member, member.userId)).toBe("mxc://example.org/known");
    expect(request).not.toHaveBeenCalled();
  });

  it("ignores late profile results after logout and retains initials on failure", async () => {
    const { profiles, member, request, updated } = setup();
    request.mockRejectedValueOnce(new Error("Private profile"));
    expect(profiles.resolve(member, member.userId)).toBeUndefined();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(profiles.resolve(member, member.userId)).toBeUndefined();
    expect(request).toHaveBeenCalledOnce();
    profiles.resolve(undefined, "@other:example.org");
    profiles.dispose();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(updated).not.toHaveBeenCalled();
  });
});
