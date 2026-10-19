import { useMemo } from "react";
import { useMatrixRuntime } from "../../app/providers/MatrixProvider";
import { useMatrixSnapshot } from "./useMatrixSnapshot";
import { usePreferences } from "../usePreferences";

export function useMatrixRooms(filter = "") {
  const prefs = usePreferences();
  const runtime = useMatrixRuntime();
  const snapshot = useMatrixSnapshot();
  const rooms = useMemo(() => {
    const query = filter.trim().toLocaleLowerCase();
    const filtered = query
      ? snapshot.rooms.filter((room) =>
          room.name.toLocaleLowerCase().includes(query),
        )
      : snapshot.rooms;
    return [...filtered].sort((a, b) => (prefs.roomSort === "unread" ? b.highlightCount - a.highlightCount || b.unreadCount - a.unreadCount : 0) || a.name.localeCompare(b.name));
  }, [filter, snapshot.rooms, prefs.roomSort]);
  return {
    rooms,
    selectedRoomId: snapshot.selectedRoomId,
    selectRoom: (roomId: string) => runtime.selectRoom(roomId),
    closeDirectMessage: (roomId: string) => runtime.closeDirectMessage(roomId),
    joinRoom: (roomIdOrAlias: string) => runtime.joinRoom(roomIdOrAlias),
    declineInvite: (roomId: string) => runtime.declineInvite(roomId),
  };
}
