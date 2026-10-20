import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import type { MatrixClient } from "matrix-js-sdk";
import { MatrixRTCSessionEvent } from "matrix-js-sdk/lib/matrixrtc";
import { observeRoomCalls } from "./MatrixRoomCalls";

describe("voice channel participants", () => {
  it("lists people once across devices and updates as they leave", () => {
    const session = Object.assign(new EventEmitter(), { memberships: [{ userId: "@alice:example" }, { userId: "@alice:example" }, { userId: "@bob:example" }] });
    const manager = Object.assign(new EventEmitter(), { getActiveRoomSession: () => session });
    const client = { matrixRTC: manager, getRooms: () => [{ roomId: "!voice", name: "Lounge", getMyMembership: () => "join", getMember: (id: string) => ({ name: id === "@alice:example" ? "Alice" : "Bob", getMxcAvatarUrl: () => null }) }] } as unknown as MatrixClient;
    const listener = vi.fn();
    const dispose = observeRoomCalls(client, listener);
    expect(listener).toHaveBeenLastCalledWith([{ roomId: "!voice", name: "Lounge", participants: 2, members: [
      { id: "@alice:example", displayName: "Alice", avatarUrl: null }, { id: "@bob:example", displayName: "Bob", avatarUrl: null },
    ] }]);
    session.memberships = [];
    session.emit(MatrixRTCSessionEvent.MembershipsChanged);
    expect(listener).toHaveBeenLastCalledWith([]);
    dispose();
    expect(session.listenerCount(MatrixRTCSessionEvent.MembershipsChanged)).toBe(0);
  });
});
