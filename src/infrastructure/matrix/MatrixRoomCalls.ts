import { hasLocallyLeftCall, observeLocalCallState } from "./MatrixLocalCallState";
﻿import { MatrixRTCSessionEvent, MatrixRTCSessionManagerEvents, type MatrixRTCSession } from "matrix-js-sdk/lib/matrixrtc";
import type { MatrixClient } from "matrix-js-sdk";
import type { RoomCall } from "../../domain/calls/ICallProvider";
import { MatrixMediaResolver } from "./MatrixMediaResolver";
export type { RoomCall } from "../../domain/calls/ICallProvider";
export function observeRoomCalls(client: MatrixClient, listener: (calls: RoomCall[]) => void) {
  const manager = client.matrixRTC;
  const sessions = new Set<MatrixRTCSession>();
  const media = new MatrixMediaResolver(client);
  const update = () => listener(client.getRooms().filter(room => room.getMyMembership() === "join").flatMap(room => {
    const session = manager.getActiveRoomSession(room);
    const members = [...new Set(session?.memberships.filter(member => !hasLocallyLeftCall(client, room.roomId) || member.userId !== client.getUserId() || member.deviceId !== client.getDeviceId()).map(member => member.userId) ?? [])].map(id => {
      const member = room.getMember(id);
      return { id, displayName: member?.name || id, avatarUrl: media.resolve(member?.getMxcAvatarUrl() ?? null, 48, 48) };
    });
    return members.length ? [{ roomId: room.roomId, name: room.name, participants: members.length, members }] : [];
  }));
  const attach = (_roomId: string, session: MatrixRTCSession) => { if (!sessions.has(session)) { sessions.add(session); session.on(MatrixRTCSessionEvent.MembershipsChanged, update); } update(); };
  const ended = (_roomId: string, session: MatrixRTCSession) => { session.off(MatrixRTCSessionEvent.MembershipsChanged, update); sessions.delete(session); update(); };
  manager.on(MatrixRTCSessionManagerEvents.SessionStarted, attach);
  manager.on(MatrixRTCSessionManagerEvents.SessionEnded, ended);
  for (const room of client.getRooms()) { const session = manager.getActiveRoomSession(room); if (session) attach(room.roomId, session); }
  const stopLocal = observeLocalCallState(client, update);
  update();
  return () => { stopLocal(); manager.off(MatrixRTCSessionManagerEvents.SessionStarted, attach); manager.off(MatrixRTCSessionManagerEvents.SessionEnded, ended); for (const session of sessions) session.off(MatrixRTCSessionEvent.MembershipsChanged, update); };
}
