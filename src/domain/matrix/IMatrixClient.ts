import type { PollInput, PollSnapshot } from "../messaging/Polls";
import type { MessageAttachment } from "../messaging/Attachments";
import type { MatrixEventSource } from "./MatrixEvents";
import type { MessageSearchQuery, MessageSearchResults } from "../messaging/MessageSearch";
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
  acceptUserIdentity(userId: string): Promise<void>;
  observeUserVerification(userId: string, listener: (status: import("./MatrixTypes").MatrixPeerVerification) => void): () => void;
  getIdentityState(): MatrixIdentityState;
  refreshIdentity(): Promise<void>;
  requestIdentityVerification(): Promise<void>;
  requestUserVerification(userId: string): Promise<void>;
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
  discoverSpaceRooms(spaceId: string): Promise<MatrixRoom[]>;
  joinRoom(roomIdOrAlias: string, viaServers?: string[]): Promise<MatrixRoom>;
  leaveRoom(roomId: string): Promise<void>;
  inviteUser(roomId: string, userId: string): Promise<void>;
  searchUsers(term: string): Promise<MatrixUser[]>;
  startDirectMessage(userId: string): Promise<MatrixRoom>;
  setDirectMessageClosed(roomId: string, closed: boolean): Promise<void>;

  getTimeline(roomId: string): MatrixMessage[];
  getPinnedMessages(roomId: string): Promise<MatrixMessage[]>;
  searchMessages(query: MessageSearchQuery, signal?: AbortSignal, onProgress?: (result: MessageSearchResults) => void): Promise<MessageSearchResults>;
  getMessageContext(roomId: string, eventId: string): Promise<MatrixMessage[]>;
  refreshTimeline(roomId: string): Promise<MatrixMessage[]>;
  loadOlderMessages(roomId: string, limit?: number): Promise<MatrixTimelinePage>;

  sendTextMessage(
    roomId: string,
    body: string,
    options?: MatrixSendTextOptions,
  ): Promise<string>;
  createPoll(roomId: string, input: PollInput): Promise<string>;
  observePoll(roomId: string, eventId: string, listener: (poll: PollSnapshot) => void): () => void;
  votePoll(roomId: string, eventId: string, answers: string[]): Promise<void>;
  endPoll(roomId: string, eventId: string): Promise<void>;
  getUploadLimit(): Promise<number | null>;
  retryMessage(roomId: string, eventId: string): Promise<void>;
  cancelSend(roomId: string, eventId: string): Promise<void>;
  sendAttachment(roomId: string, file: File, onProgress?: (percent: number) => void, options?: MatrixSendTextOptions): Promise<string>;
  loadAttachment(attachment: MessageAttachment, signal?: AbortSignal): Promise<Blob>;
  editMessage(roomId: string, eventId: string, body: string): Promise<string>;
  redactMessage(roomId: string, eventId: string, reason?: string): Promise<void>;
  setMessagePinned(roomId: string, eventId: string, pinned: boolean): Promise<void>;

  setTyping(roomId: string, typing: boolean): Promise<void>;
  sendReadReceipt(roomId: string, eventId?: string): Promise<void>;

  addReaction(roomId: string, eventId: string, key: string): Promise<string>;
  removeReaction(roomId: string, reactionEventId: string): Promise<void>;

  getRoomMembers(roomId: string): MatrixRoomMember[];
  loadAvatar(url: string): Promise<string>;
  getOwnProfile(): Promise<MatrixUser>;
  resolveMediaUrl(mxcUrl: string | null, width?: number, height?: number): string | null;
}
