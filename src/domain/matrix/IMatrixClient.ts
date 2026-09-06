import type { MatrixEventSource } from "./MatrixEvents";
import type {
  MatrixMessage,
  MatrixRoom,
  MatrixRoomMember,
  MatrixSendTextOptions,
  MatrixSession,
  MatrixSyncStatus,
  MatrixTimelinePage,
} from "./MatrixTypes";

export interface IMatrixClient extends MatrixEventSource {
  readonly currentSession: MatrixSession | null;
  readonly syncStatus: MatrixSyncStatus;

  start(session: MatrixSession): Promise<void>;
  stop(): Promise<void>;
  logout(): Promise<void>;

  getRooms(): MatrixRoom[];
  getRoom(roomId: string): MatrixRoom | null;
  joinRoom(roomIdOrAlias: string): Promise<MatrixRoom>;
  leaveRoom(roomId: string): Promise<void>;

  getTimeline(roomId: string): MatrixMessage[];
  loadOlderMessages(roomId: string, limit?: number): Promise<MatrixTimelinePage>;

  sendTextMessage(
    roomId: string,
    body: string,
    options?: MatrixSendTextOptions,
  ): Promise<string>;
  editMessage(roomId: string, eventId: string, body: string): Promise<string>;
  redactMessage(roomId: string, eventId: string, reason?: string): Promise<void>;

  setTyping(roomId: string, typing: boolean): Promise<void>;
  sendReadReceipt(roomId: string, eventId: string): Promise<void>;

  addReaction(roomId: string, eventId: string, key: string): Promise<string>;
  removeReaction(roomId: string, reactionEventId: string): Promise<void>;

  getRoomMembers(roomId: string): MatrixRoomMember[];
  resolveMediaUrl(mxcUrl: string | null, width?: number, height?: number): string | null;
}
