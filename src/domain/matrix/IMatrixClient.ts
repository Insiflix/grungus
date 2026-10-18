import type { MatrixEventSource } from "./MatrixEvents";
import type {
  MatrixMessage,
  MatrixRoom,
  MatrixRoomMember,
  MatrixSendTextOptions,
  MatrixSession,
  MatrixSyncStatus,
  MatrixTimelinePage,
  MatrixUser,
  MatrixIdentityState,
} from "./MatrixTypes";

export interface IMatrixClient extends MatrixEventSource {
  getIdentityState(): MatrixIdentityState;
  refreshIdentity(): Promise<void>;
  requestIdentityVerification(): Promise<void>;
  acceptIdentityVerification(): Promise<void>;
  startIdentityComparison(): Promise<void>;
  confirmIdentityComparison(matches: boolean): Promise<void>;
  cancelIdentityVerification(): Promise<void>;
  recoverIdentity(recoveryKey: string): Promise<void>;
  prepareIdentityReset(): Promise<void>;
  resetIdentity(confirmed: boolean): Promise<void>;
  submitIdentityAuth(password?: string): void;
  cancelIdentityAuth(): void;
  clearIdentitySecrets(): void;
  readonly currentSession: MatrixSession | null;
  readonly syncStatus: MatrixSyncStatus;

  start(session: MatrixSession): Promise<void>;
  stop(): Promise<void>;
  logout(): Promise<void>;

  getRooms(): MatrixRoom[];
  getRoom(roomId: string): MatrixRoom | null;
  joinRoom(roomIdOrAlias: string): Promise<MatrixRoom>;
  leaveRoom(roomId: string): Promise<void>;
  inviteUser(roomId: string, userId: string): Promise<void>;
  searchUsers(term: string): Promise<MatrixUser[]>;
  startDirectMessage(userId: string): Promise<MatrixRoom>;

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
  loadAvatar(url: string): Promise<string>;
  getOwnProfile(): Promise<MatrixUser>;
  resolveMediaUrl(mxcUrl: string | null, width?: number, height?: number): string | null;
}
