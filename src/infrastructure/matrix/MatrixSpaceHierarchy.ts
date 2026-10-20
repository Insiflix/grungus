import type { MatrixClient } from "matrix-js-sdk";
import type { IHierarchyRoom } from "matrix-js-sdk/lib/@types/spaces";
import type { MatrixRoom } from "../../domain/matrix/MatrixTypes";

export async function discoverSpaceRooms(client: MatrixClient, spaceId: string, resolveMedia: (url: string | null) => string | null): Promise<MatrixRoom[]> {
  const summaries = new Map<string, IHierarchyRoom>();
  const tokens = new Set<string>();
  let token: string | undefined;
  do {
    if (tokens.size >= 100 || summaries.size >= 10_000) throw new Error("This space exceeds the safe channel discovery limit.");
    const page = await client.getRoomHierarchy(spaceId, 100, undefined, false, token);
    for (const room of page.rooms) {
      if (summaries.size >= 10_000 && !summaries.has(room.room_id)) throw new Error("This space exceeds the safe channel discovery limit.");
      summaries.set(room.room_id, room);
    }
    token = page.next_batch;
    if (token && tokens.has(token)) throw new Error("The server repeated a channel discovery page. Please retry.");
    if (token) tokens.add(token);
  } while (token);
  const via = new Map<string, string[]>();
  for (const room of summaries.values()) {
    for (const child of room.children_state ?? []) {
      if (child.type === "m.space.child" && child.content.via?.length) via.set(child.state_key, child.content.via);
    }
  }
  return [...summaries.values()].filter(room => room.room_id !== spaceId).map(room => ({
    id: room.room_id,
    name: room.name || room.canonical_alias || "Unnamed channel",
    avatarUrl: resolveMedia(room.avatar_url ?? null),
    topic: room.topic ?? null,
    unreadCount: 0, highlightCount: 0, isEncrypted: false,
    membership: client.getRoom(room.room_id)?.getMyMembership() === "invite" ? "invite" : "leave",
    memberCount: room.num_joined_members,
    isSpace: room.room_type === "m.space",
    roomType: room.room_type,
    joinRule: room.join_rule,
    viaServers: via.get(room.room_id),
    childRoomIds: (room.children_state ?? []).filter(child => child.type === "m.space.child" && child.content.via?.length).map(child => child.state_key),
  }));
}
