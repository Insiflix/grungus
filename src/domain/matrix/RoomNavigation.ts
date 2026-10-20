import type { MatrixRoom } from "./MatrixTypes";

export function isVoiceRoom(room: MatrixRoom): boolean {
  return ["org.matrix.msc3417.call", "io.element.video", "m.call"].includes(room.roomType ?? "");
}

export function spaceRoomIds(spaces: MatrixRoom[], discovered: Readonly<Record<string, MatrixRoom[]>>): Set<string> {
  return new Set(spaces.flatMap(space => [...(space.childRoomIds ?? []), ...(discovered[space.id] ?? []).map(room => room.id)]));
}

export function canJoinChannel(room: MatrixRoom): boolean {
  return room.membership === "join" || room.membership === "invite" || ["public", "restricted", "knock_restricted"].includes(room.joinRule ?? "");
}
