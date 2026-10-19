import type {} from "matrix-js-sdk/lib/@types/event";

declare module "matrix-js-sdk/lib/@types/event" {
  interface AccountDataEvents {
    "dev.grungus.closed_direct_rooms": { rooms: string[] };
  }
}

export const closedDirectRoomsEvent = "dev.grungus.closed_direct_rooms";

export function closedDirectRoomIds(content: unknown): string[] {
  const rooms = content && typeof content === "object" ? (content as { rooms?: unknown }).rooms : undefined;
  return Array.isArray(rooms) ? [...new Set(rooms.filter((id): id is string => typeof id === "string" && id.startsWith("!")))] : [];
}
