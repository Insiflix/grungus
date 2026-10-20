import { describe, expect, it, vi } from "vitest";
import type { MatrixClient, Room, RoomMember } from "matrix-js-sdk";
import { MatrixRoomMapper } from "./MatrixRoomMapper";

describe("MatrixRoomMapper", () => {
  it("uses the other member's profile picture when a DM has no explicit room avatar", () => {
    const room = {
      roomId: "!dm:example.org", name: "Alice", getLiveTimeline: () => ({ getState: () => ({ getStateEvents: () => undefined }) }),
      getMxcAvatarUrl: () => null,
      getAvatarFallbackMember: () => ({ getMxcAvatarUrl: () => "mxc://example.org/alice-avatar" }),
      getUnreadNotificationCount: () => 0, hasEncryptionStateEvent: () => true,
      getMyMembership: () => "join", getJoinedMemberCount: () => 2,
    } as unknown as Room;
    const mapped = new MatrixRoomMapper({ getHomeserverUrl: () => "https://matrix.example.org" } as MatrixClient).map(room);
    expect(mapped.avatarUrl).toContain("/_matrix/client/v1/media/thumbnail/example.org/alice-avatar");
  });
  it("reads current state from the live timeline and maps room metadata", () => {
    const getStateEvents = vi.fn(() => ({
      getContent: () => ({ topic: "A mapped topic" }),
    }));
    const getState = vi.fn(() => ({ getStateEvents }));
    const room = {
      roomId: "!room:example.org",
      name: "Example room",
      getLiveTimeline: () => ({ getState }),
      getMxcAvatarUrl: () => null,
      getUnreadNotificationCount: () => 2,
      hasEncryptionStateEvent: () => true,
      getMyMembership: () => "join",
      getJoinedMemberCount: () => 7,
    } as unknown as Room;

    const mapped = new MatrixRoomMapper({} as MatrixClient).map(room);

    expect(getState).toHaveBeenCalledOnce();
    expect(getStateEvents).toHaveBeenCalledWith("m.room.topic", "");
    expect(mapped).toMatchObject({
      id: "!room:example.org",
      name: "Example room",
      topic: "A mapped topic",
      isEncrypted: true,
      membership: "join",
      memberCount: 7,
      isDirect: false,
      isSpace: false,
      childRoomIds: [],
    });
  });

  it("classifies direct messages using account data, regardless of member count", () => {
    const room = {
      roomId: "!dm:example.org", name: "A conversation",
      getLiveTimeline: () => ({ getState: () => ({ getStateEvents: () => undefined }) }),
      getMxcAvatarUrl: () => null, getUnreadNotificationCount: () => 0,
      hasEncryptionStateEvent: () => true, getMyMembership: () => "join",
      getJoinedMemberCount: () => 3, isSpaceRoom: () => false,
    } as unknown as Room;
    const client = {
      getAccountData: () => ({ getContent: () => ({ "@friend:example.org": [room.roomId] }) }),
    } as unknown as MatrixClient;
    expect(new MatrixRoomMapper(client).map(room)).toMatchObject({ isDirect: true, directUserId: "@friend:example.org" });
    expect(new MatrixRoomMapper({ getAccountData: () => undefined } as unknown as MatrixClient).map(room).isDirect).toBe(false);
  });

  it("maps reported member presence and leaves missing presence unknown", () => {
    const member = { userId: "@alice:example", name: "Alice", getMxcAvatarUrl: () => null, membership: "join", typing: false } as unknown as RoomMember;
    const client = { getUser: () => ({ events: { presence: { getContent: () => ({ presence: "unavailable" }) } } }) } as unknown as MatrixClient;
    expect(new MatrixRoomMapper(client).mapMember(member).presence).toBe("unavailable");
    expect(new MatrixRoomMapper({ getUser: () => null } as unknown as MatrixClient).mapMember(member).presence).toBe("unknown");
  });

  it("maps only active space children for server navigation", () => {
    const room = {
      roomId: "!space:example.org", name: "Forest",
      getLiveTimeline: () => ({ getState: () => ({ getStateEvents: (type: string) => type === "m.space.child" ? [
        { getContent: () => ({ via: ["example.org"] }), getStateKey: () => "!child:example.org" },
        { getContent: () => ({}), getStateKey: () => "!removed:example.org" },
      ] : undefined }) }),
      getMxcAvatarUrl: () => null, getUnreadNotificationCount: () => 0,
      hasEncryptionStateEvent: () => false, getMyMembership: () => "join",
      getJoinedMemberCount: () => 5, isSpaceRoom: () => true,
    } as unknown as Room;
    expect(new MatrixRoomMapper({} as MatrixClient).map(room)).toMatchObject({
      isSpace: true, childRoomIds: ["!child:example.org"],
    });
  });
});
