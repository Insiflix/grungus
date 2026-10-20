import { describe, expect, it, vi } from "vitest";
import type { MatrixClient } from "matrix-js-sdk";
import { discoverSpaceRooms } from "./MatrixSpaceHierarchy";
import { MatrixJsSdkClient } from "./MatrixJsSdkClient";

describe("space channel discovery", () => {
  it("bounds a malicious server's endless unique pagination tokens", async () => {
    let page = 0;
    const client = { getRoomHierarchy: vi.fn(async () => ({ rooms: [], next_batch: String(++page) })) } as unknown as MatrixClient;
    await expect(discoverSpaceRooms(client, "!space", () => null)).rejects.toThrow("safe channel discovery limit");
    expect(client.getRoomHierarchy).toHaveBeenCalledTimes(100);
  });
  it("subscribes to accessible voice rooms for live participants without starting media or joining text rooms", async () => {
    const matrix = new MatrixJsSdkClient();
    const sdk = {
      getRoom: (id: string) => id === "!server" ? { getMyMembership: () => "join" } : null,
      getRoomHierarchy: vi.fn(async () => ({ rooms: [
        { room_id: "!server", room_type: "m.space", children_state: [{ type: "m.space.child", state_key: "!voice", content: { via: ["remote"] } }] },
        { room_id: "!voice", room_type: "org.matrix.msc3417.call", join_rule: "public", num_joined_members: 1 },
        { room_id: "!private-voice", room_type: "org.matrix.msc3417.call", join_rule: "invite", num_joined_members: 1 },
        { room_id: "!text", join_rule: "public", num_joined_members: 1 },
      ] })),
    };
    Object.assign(matrix, { client: sdk });
    const join = vi.spyOn(matrix, "joinRoom").mockResolvedValue({ id: "!voice" } as never);
    const media = vi.spyOn(matrix, "mountCall");
    await matrix.discoverSpaceRooms("!server");
    expect(join).toHaveBeenCalledExactlyOnceWith("!voice", ["remote"]);
    expect(media).not.toHaveBeenCalled();
  });
  it("loads every page, including nested and non-suggested channels, and preserves routing and access rules", async () => {
    const getRoomHierarchy = vi.fn().mockResolvedValueOnce({ rooms: [
      { room_id: "!space", name: "Server", children_state: [{ type: "m.space.child", state_key: "!nested", content: { via: ["remote"] } }] },
      { room_id: "!nested", room_type: "m.space", name: "Category", children_state: [{ type: "m.space.child", state_key: "!voice", content: { via: ["voice.example"] } }] },
    ], next_batch: "page2" }).mockResolvedValueOnce({ rooms: [
      { room_id: "!voice", name: "Lounge", num_joined_members: 3, room_type: "org.matrix.msc3417.call", join_rule: "restricted", avatar_url: "mxc://example/avatar", children_state: [] },
      { room_id: "!public", name: "general", num_joined_members: 5, join_rule: "public", children_state: [] },
    ] });
    const client = { getRoomHierarchy, getRoom: () => null } as unknown as MatrixClient;
    const rooms = await discoverSpaceRooms(client, "!space", url => url ? `resolved:${url}` : null);
    expect(getRoomHierarchy.mock.calls).toEqual([["!space", 100, undefined, false, undefined], ["!space", 100, undefined, false, "page2"]]);
    expect(rooms.map(room => room.id)).toEqual(["!nested", "!voice", "!public"]);
    expect(rooms.find(room => room.id === "!voice")).toMatchObject({ roomType: "org.matrix.msc3417.call", membership: "leave", viaServers: ["voice.example"], joinRule: "restricted", avatarUrl: "resolved:mxc://example/avatar" });
    expect(rooms.find(room => room.id === "!public")).toMatchObject({ joinRule: "public", name: "general" });
  });
  it("rejects repeated pagination tokens instead of looping forever", async () => {
    const client = { getRoomHierarchy: vi.fn(async () => ({ rooms: [], next_batch: "same" })) } as unknown as MatrixClient;
    await expect(discoverSpaceRooms(client, "!space", () => null)).rejects.toThrow("repeated");
    expect(client.getRoomHierarchy).toHaveBeenCalledTimes(2);
  });
});
