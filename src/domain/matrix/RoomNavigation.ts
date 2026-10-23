import type { MatrixRoom } from "./MatrixTypes";

export function isVoiceRoom(room: MatrixRoom): boolean {
  return ["org.matrix.msc3417.call", "io.element.video", "m.call"].includes(room.roomType ?? "");
}

export function spaceRoomIds(spaces: MatrixRoom[], discovered: Readonly<Record<string, MatrixRoom[]>>): Set<string> {
  return new Set(spaces.flatMap(space => [...(space.childRoomIds ?? []), ...(discovered[space.id] ?? []).map(room => room.id)]));
}

export function canJoinChannel(room: MatrixRoom): boolean {
  if (room.membership === "ban") return false;
  // Hierarchy summaries may omit access rules. Let the homeserver decide a
  // join attempt instead of presenting missing data as invitation-only access.
  return room.membership === "join" || room.membership === "invite" || !room.joinRule || ["public", "restricted", "knock_restricted"].includes(room.joinRule);
}
