import type { MessageAttachment } from "../messaging/Attachments";
export type MatrixMembership = "join" | "invite" | "leave" | "ban" | "knock";

export interface MatrixIdentityState {
  available: boolean;
  deviceId: string;
  verified: boolean;
  hasIdentity: boolean;
  hasRecovery: boolean;
  busy: boolean;
  error: string | null;
  notice: string | null;
  newRecoveryKey: string | null;
  resetComplete: boolean;
  verification: {
    userId: string;
    deviceId?: string;
    incoming: boolean;
    phase: "requested" | "ready" | "started" | "done" | "cancelled";
    emoji?: [string, string][];
    decimal?: number[];
  } | null;
  auth: { session: string; stage: string; url: string; error?: string } | null;
}

export interface MatrixUser {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface MatrixRoom {
  id: string;
  name: string;
  avatarUrl: string | null;
  topic: string | null;
  unreadCount: number;
  highlightCount: number;
  isEncrypted: boolean;
  membership: MatrixMembership;
  memberCount: number;
  isDirect?: boolean;
  isDirectClosed?: boolean;
  isSpace?: boolean;
  childRoomIds?: string[];
}

export type MatrixMessageType =
  | "text"
  | "notice"
  | "emote"
  | "image"
  | "file"
  | "unsupported"
  | "encrypted";

export type MatrixMessageSendState =
  | "sending"
  | "sent"
  | "failed"
  | "cancelled";

export interface MatrixReaction {
  key: string;
  count: number;
  userIds: string[];
  eventId?: string;
}

export interface MatrixMessage {
  id: string;
  roomId: string;
  sender: MatrixUser;
  timestamp: number;
  type: MatrixMessageType;
  body: string;
  attachment?: MessageAttachment;
  edited: boolean;
  replyTo: string | null;
  reactions: MatrixReaction[];
  sendState: MatrixMessageSendState;
  isOwn: boolean;
  isRedacted: boolean;
  isPinned?: boolean;
  canPin?: boolean;
  mentions?: MatrixUser[];
  mentionsOwnUser?: boolean;
}

export interface MatrixRoomMember extends MatrixUser {
  membership: MatrixMembership;
  isTyping: boolean;
}

export type MatrixSyncState =
  | "stopped"
  | "connecting"
  | "synchronizing"
  | "ready"
  | "error";

export interface MatrixSyncStatus {
  state: MatrixSyncState;
  error: string | null;
}

export interface MatrixSession {
  homeserverUrl: string;
  serverName: string;
  accessToken: string;
  refreshToken?: string;
  userId: string;
  deviceId: string;
}

export interface MatrixIdentityProvider {
  id: string;
  name: string;
  iconUrl: string | null;
  brand: string | null;
}

export interface MatrixAuthCapabilities {
  serverName: string;
  homeserverUrl: string;
  password: boolean;
  browser: boolean;
  delegatedOAuth: boolean;
  identityProviders: MatrixIdentityProvider[];
}

export interface MatrixRegistrationAuth {
  session?: string;
  type?: string;
  token?: string;
}

export interface MatrixRegistrationChallenge {
  session: string;
  flows: { stages: string[] }[];
  completed: string[];
}

export type MatrixRegistrationResult =
  | { session: MatrixSession; challenge?: never }
  | { challenge: MatrixRegistrationChallenge; session?: never };

export interface MatrixSendTextOptions {
  replyToEventId?: string;
}

export interface MatrixTimelinePage {
  messages: MatrixMessage[];
  hasMore: boolean;
}
