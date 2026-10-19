import { describe, expect, it } from "vitest";
import type { Room } from "matrix-js-sdk";
import { directInvitePeer } from "./MatrixDirectRooms";

describe("direct invite recognition", () => {
  it("recognizes outgoing direct invites without account data", () => {
    const room = { getMembers: () => [{ userId: "@slitix:example", membership: "join", getDMInviter: () => "@me:example" }] } as unknown as Room;
    expect(directInvitePeer(room, "@me:example")).toBe("@slitix:example");
  });
  it("does not treat ordinary two-person rooms as direct conversations", () => {
    const room = { getMembers: () => [{ userId: "@slitix:example", membership: "join", getDMInviter: () => undefined }] } as unknown as Room;
    expect(directInvitePeer(room, "@me:example")).toBeUndefined();
  });
});
