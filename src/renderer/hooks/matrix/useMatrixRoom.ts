import { useMatrixSnapshot } from "./useMatrixSnapshot";

export function useMatrixRoom(roomId: string | null) {
  const snapshot = useMatrixSnapshot();
  if (!roomId) return null;
  return snapshot.rooms.find((room) => room.id === roomId) ?? null;
}
