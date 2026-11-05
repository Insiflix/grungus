import { hasLocallyLeftCall, observeLocalCallState } from "./MatrixLocalCallState";
import { MatrixRTCSessionEvent, MatrixRTCSessionManagerEvents, type MatrixRTCSession } from "matrix-js-sdk/lib/matrixrtc";
import { ClientEvent, type MatrixClient } from "matrix-js-sdk";
import type { RoomCall } from "../../domain/calls/ICallProvider";
import { MatrixMediaResolver } from "./MatrixMediaResolver";
export type { RoomCall } from "../../domain/calls/ICallProvider";
export function observeRoomCalls(client: MatrixClient, listener: (calls: RoomCall[]) => void) {
  const manager = client.matrixRTC;
  const sessions = new Map<string, MatrixRTCSession>();
  const media = new MatrixMediaResolver(client);
  const update = () => {
    const rooms = client.getRooms().filter(room => room.getMyMembership() === "join");
    const joined = new Set(rooms.map(room => room.roomId));
    for (const [id, session] of sessions) if (!joined.has(id)) { session.off(MatrixRTCSessionEvent.MembershipsChanged, update); sessions.delete(id); }
    listener(rooms.flatMap(room => {
      // Observe empty sessions too. Initial sync can replace SDK sessions without
      // a SessionStarted event, and membership changes do not require local media.
      const session = manager.getRoomSession(room);
      const previous = sessions.get(room.roomId);
      if (previous !== session) {
        previous?.off(MatrixRTCSessionEvent.MembershipsChanged, update);
        session.on(MatrixRTCSessionEvent.MembershipsChanged, update);
        sessions.set(room.roomId, session);
      }
      const members = [...new Set(session?.memberships.filter(member => !hasLocallyLeftCall(client, room.roomId) || member.userId !== client.getUserId() || member.deviceId !== client.getDeviceId()).map(member => member.userId) ?? [])].map(id => {
        const member = room.getMember(id);
        return { id, displayName: member?.name || id, avatarUrl: media.resolve(member?.getMxcAvatarUrl() ?? null, 48, 48) };
      });
      return members.length ? [{ roomId: room.roomId, name: room.name, participants: members.length, members }] : [];
    }));
  };
  manager.on(MatrixRTCSessionManagerEvents.SessionStarted, update);
  manager.on(MatrixRTCSessionManagerEvents.SessionEnded, update);
  client.on(ClientEvent.Room, update);
  client.on(ClientEvent.Sync, update);
  const stopLocal = observeLocalCallState(client, update);
  update();
  return () => { stopLocal(); manager.off(MatrixRTCSessionManagerEvents.SessionStarted, update); manager.off(MatrixRTCSessionManagerEvents.SessionEnded, update); client.off(ClientEvent.Room, update); client.off(ClientEvent.Sync, update); for (const session of sessions.values()) session.off(MatrixRTCSessionEvent.MembershipsChanged, update); };
}
