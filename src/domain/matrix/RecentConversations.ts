import type { MatrixMessage, MatrixRoom } from "./MatrixTypes";

export function latestMessageTime(room: MatrixRoom, timelines: Readonly<Record<string, MatrixMessage[]>>): number {
  return Math.max(room.lastMessageTimestamp ?? 0, ...(timelines[room.id] ?? []).map(message => message.timestamp));
}

export function recentConversations(rooms: MatrixRoom[], timelines: Readonly<Record<string, MatrixMessage[]>>): MatrixRoom[] {
  return [...rooms].sort((a, b) => latestMessageTime(b, timelines) - latestMessageTime(a, timelines) || a.id.localeCompare(b.id));
}
