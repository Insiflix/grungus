export type MatrixMembership = "join" | "invite" | "leave" | "ban" | "knock";

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
  edited: boolean;
  replyTo: string | null;
  reactions: MatrixReaction[];
  sendState: MatrixMessageSendState;
  isOwn: boolean;
  isRedacted: boolean;
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

export interface MatrixSendTextOptions {
  replyToEventId?: string;
}

export interface MatrixTimelinePage {
  messages: MatrixMessage[];
  hasMore: boolean;
}
