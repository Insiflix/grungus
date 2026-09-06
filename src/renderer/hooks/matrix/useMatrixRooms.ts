import { useMemo } from "react";
import { useMatrixRuntime } from "../../app/providers/MatrixProvider";
import { useMatrixSnapshot } from "./useMatrixSnapshot";

export function useMatrixRooms(filter = "") {
  const runtime = useMatrixRuntime();
  const snapshot = useMatrixSnapshot();
  const rooms = useMemo(() => {
    const query = filter.trim().toLocaleLowerCase();
    return query
      ? snapshot.rooms.filter((room) =>
          room.name.toLocaleLowerCase().includes(query),
        )
      : snapshot.rooms;
  }, [filter, snapshot.rooms]);
  return {
    rooms,
    selectedRoomId: snapshot.selectedRoomId,
    selectRoom: (roomId: string) => runtime.selectRoom(roomId),
    joinRoom: (roomIdOrAlias: string) => runtime.joinRoom(roomIdOrAlias),
  };
}
