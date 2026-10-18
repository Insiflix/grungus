import type {
  MatrixMessage,
  MatrixRoom,
  MatrixRoomMember,
  MatrixSyncStatus,
  MatrixIdentityState,
  MatrixUser,
} from "./MatrixTypes";

export interface MatrixApplicationEvents {
  profileUpdated: MatrixUser;
  identityChanged: MatrixIdentityState;
  syncStateChanged: MatrixSyncStatus;
  roomsChanged: MatrixRoom[];
  roomUpdated: MatrixRoom;
  messageAdded: MatrixMessage;
  messageUpdated: MatrixMessage;
  messageRemoved: { roomId: string; eventId: string };
  typingChanged: { roomId: string; members: MatrixRoomMember[] };
  receiptsChanged: { roomId: string };
}

export type MatrixEventName = keyof MatrixApplicationEvents;
export type MatrixEventListener<K extends MatrixEventName> = (
  payload: MatrixApplicationEvents[K],
) => void;

export interface MatrixEventSource {
  subscribe<K extends MatrixEventName>(
    event: K,
    listener: MatrixEventListener<K>,
  ): () => void;
}
