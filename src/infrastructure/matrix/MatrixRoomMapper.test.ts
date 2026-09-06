import { describe, expect, it, vi } from "vitest";
import type { MatrixClient, Room } from "matrix-js-sdk";
import { MatrixRoomMapper } from "./MatrixRoomMapper";

describe("MatrixRoomMapper", () => {
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
    });
  });
});
