import type { TimelineEvents } from "matrix-js-sdk";
import { createPollEvent, observeMatrixPoll, sendPollVote, closeMatrixPoll } from "./MatrixPolls";
import type { PollInput, PollSnapshot } from "../../domain/messaging/Polls";
import { hiddenTopChannels } from "../../domain/settings/HiddenTopChannels";
import { getUploadLimit } from "./MatrixUploadLimit";
import { PendingMessageError } from "../../domain/messaging/PendingMessageError";
import { searchMatrixMessages } from "./MatrixMessageSearch";
import type { MessageSearchQuery, MessageSearchResults } from "../../domain/messaging/MessageSearch";
import { sendAttachment, loadAttachment } from "./MatrixAttachments";
import type { MessageAttachment } from "../../domain/messaging/Attachments";
import { MatrixDirectCalls } from "./MatrixDirectCalls";
import { directInvitePeer } from "./MatrixDirectRooms";
import { collectTimelineEvents, loadLatestRoomEvents, oldestLoadedTimeline } from "./MatrixTimelineLoader";
import { createMentionContent } from "../../domain/messaging/Mentions";
import { closedDirectRoomIds, closedDirectRoomsEvent } from "./MatrixClosedDirectRooms";
import type { ICallProvider, CallOptions } from "../../domain/calls/ICallProvider";
import { observeRoomCalls, type RoomCall } from "./MatrixRoomCalls";
import { mountMatrixCall } from "./MatrixCallDriver";
import {
  ClientEvent,
  MatrixEventEvent,
  UserEvent,
  type User,
  createClient,
  Direction,
  EventType,
  getHttpUriForMxc,
  MsgType,
  RelationType,
  Preset,
  RoomEvent,
  RoomMemberEvent,
  RoomStateEvent,
  SyncState,
  EventStatus,
  type MatrixClient,
  type MatrixEvent,
  type Room,
  type RoomMember,
  type RoomState,
  type SyncStateData,
} from "matrix-js-sdk";
import type { IMatrixClient } from "../../domain/matrix/IMatrixClient";
import type {
  MatrixApplicationEvents,
  MatrixEventListener,
  MatrixEventName,
} from "../../domain/matrix/MatrixEvents";
import type {
  MatrixMessage,
  MatrixRoom,
  MatrixRoomMember,
  MatrixSendTextOptions,
  MatrixSession,
  MatrixSyncStatus,
  MatrixTimelinePage,
  MatrixUser,
} from "../../domain/matrix/MatrixTypes";
import { MatrixMessageMapper } from "./MatrixMessageMapper";
import { MatrixRoomMapper } from "./MatrixRoomMapper";
import { MatrixIdentityManager } from "./MatrixIdentityManager";
import { MatrixProfileAvatars } from "./MatrixProfileAvatars";
import { MatrixAvatarLoader } from "./MatrixAvatarLoader";
import { MatrixSettings } from "./MatrixSettings";
import { preferences } from "../../domain/settings/Preferences";
import { MatrixNotifications } from "./MatrixNotifications";
import { blockedUsers } from "../../domain/settings/BlockedUsers";
import { matrixPresence } from "../../domain/matrix/MatrixTypes";
import { discoverSpaceRooms } from "./MatrixSpaceHierarchy";
import { canJoinChannel, isVoiceRoom } from "../../domain/matrix/RoomNavigation";
import { secureHomeserverUrl } from "../../../electron/shared/urls";

export interface MatrixJsSdkClientOptions {
  onSessionUpdated?: (session: MatrixSession) => void | Promise<void>;
}

function errorMessage(value: unknown): string {
  return value instanceof Error ? value.message : "Unknown Matrix error";
}

export class MatrixJsSdkClient implements IMatrixClient, ICallProvider {
  readonly notifications = new MatrixNotifications();
  readonly settings = new MatrixSettings(() => this.requireClient(), async () => {
    this.emit("profileUpdated", await this.getOwnProfile());
  });
  readonly directCalls = new MatrixDirectCalls();
  observeCalls = (listener: (calls: RoomCall[]) => void) => observeRoomCalls(this.requireClient(), listener);
  mountCall = (iframe: HTMLIFrameElement, roomId: string, video: boolean, onClose: () => void, onReady?: () => void, onJoined?: () => void, options?: CallOptions) => mountMatrixCall(this.requireClient(), iframe, roomId, video, onClose, onReady, onJoined, options);
  private profileAvatars: MatrixProfileAvatars | null = null;
  private avatars: MatrixAvatarLoader | null = null;
  loadAvatar = (url: string): Promise<string> => this.avatars ? this.avatars.load(url) : Promise.reject(new Error("Not connected"));
  async getOwnProfile(): Promise<MatrixUser> {
    const client = this.requireClient();
    const id = client.getUserId()!;
    const profile = await client.getProfileInfo(id);
    this.assertCurrent(client);
    this.profileAvatars?.remember(id, profile);
    return { id, displayName: profile.displayname || id, avatarUrl: this.resolveMediaUrl(profile.avatar_url ?? null, 96, 96) };
  }
  private readonly identity = new MatrixIdentityManager((state) => this.emit("identityChanged", state));
  getIdentityState = () => this.identity.getSnapshot();
  refreshIdentity = () => this.identity.refresh();
  requestIdentityVerification = () => this.identity.requestVerification();
  acceptIdentityVerification = () => this.identity.acceptVerification();
  startIdentityComparison = () => this.identity.startComparison();
  confirmIdentityComparison = (matches: boolean) => this.identity.confirmComparison(matches);
  cancelIdentityVerification = () => this.identity.cancelVerification();
  recoverIdentity = (key: string) => this.identity.recover(key);
  prepareIdentityReset = () => this.identity.prepareReset();
  resetIdentity = (confirmed: boolean) => this.identity.reset(confirmed);
  submitIdentityAuth = (password?: string) => this.identity.submitAuth(password);
  cancelIdentityAuth = () => this.identity.cancelAuth();
  clearIdentitySecrets = () => this.identity.clearSecrets();
  private client: MatrixClient | null = null;
  private roomMapper: MatrixRoomMapper | null = null;
  private messageMapper: MatrixMessageMapper | null = null;
  private listeners = new Map<MatrixEventName, Set<(payload: unknown) => void>>();
  private session: MatrixSession | null = null;
  private status: MatrixSyncStatus = { state: "stopped", error: null };
  private startPromise: Promise<void> | null = null;
  private hasPrepared = false;
  private pendingDirectRooms = new Map<string, string>();
  private readonly membershipChanges = new WeakMap<Room, number>();
  private readonly timelineLoads = new Map<string, Promise<MatrixMessage[]>>();
  private closedDirectRooms = new Set<string>();
  private closedDirectRoomQueue: Promise<void> = Promise.resolve();

  constructor(private readonly options: MatrixJsSdkClientOptions = {}) {}

  get currentSession(): MatrixSession | null {
    return this.session;
  }

  get syncStatus(): MatrixSyncStatus {
    return this.status;
  }

  subscribe<K extends MatrixEventName>(
    event: K,
    listener: MatrixEventListener<K>,
  ): () => void {
    const listeners = this.listeners.get(event) ?? new Set<(payload: unknown) => void>();
    const untyped = listener as (payload: unknown) => void;
    listeners.add(untyped);
    this.listeners.set(event, listeners);
    return () => {
      listeners.delete(untyped);
      if (listeners.size === 0) this.listeners.delete(event);
    };
  }

  async start(session: MatrixSession): Promise<void> {
    if (
      this.client &&
      this.session?.userId === session.userId &&
      this.session.homeserverUrl === session.homeserverUrl &&
      this.session.deviceId === session.deviceId
    ) {
      return this.startPromise ?? Promise.resolve();
    }
    if (this.startPromise) {
      await this.startPromise.catch(() => undefined);
      return this.start(session);
    }

    this.startPromise = this.startInternal(session).finally(() => {
      this.startPromise = null;
    });
    return this.startPromise;
  }

  private async startInternal(session: MatrixSession): Promise<void> {
    if (this.client) await this.stop();
    this.session = session;
    preferences.setAccount(session.userId);
    hiddenTopChannels.setAccount(session.userId);
    blockedUsers.update([]);
    this.hasPrepared = false;
    this.updateStatus({ state: "connecting", error: null });

    let clientRef: MatrixClient | null = null;
    const client = createClient({
      baseUrl: secureHomeserverUrl(session.homeserverUrl),
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      userId: session.userId,
      deviceId: session.deviceId,
      timelineSupport: true,
      verificationMethods: ["m.sas.v1"],
      cryptoCallbacks: this.identity.callbacks,
      tokenRefreshFunction: session.refreshToken
        ? async (refreshToken) => {
            if (!clientRef) throw new Error("Matrix client is not ready to refresh");
            const refreshed = await clientRef.refreshToken(refreshToken);
            if (this.client !== clientRef) throw new Error("The Matrix session changed during token refresh.");
            const updated: MatrixSession = {
              ...this.session!,
              accessToken: refreshed.access_token,
              refreshToken: refreshed.refresh_token ?? refreshToken,
            };
            this.session = updated;
            await this.options.onSessionUpdated?.(updated);
            return {
              accessToken: updated.accessToken,
              refreshToken: updated.refreshToken,
            };
          }
        : undefined,
    });
    clientRef = client;
    this.client = client;
    this.avatars = new MatrixAvatarLoader(client);
    this.identity.attach(client);
    this.directCalls.attach(client);
    this.profileAvatars = new MatrixProfileAvatars(client, this.refreshUserAvatars);
    this.roomMapper = new MatrixRoomMapper(client, this.profileAvatars, roomId => this.closedDirectRooms.has(roomId));
    this.messageMapper = new MatrixMessageMapper(client, this.profileAvatars);
    this.attachSdkListeners(client);

    try {
      await client.initRustCrypto({
        useIndexedDB: true,
        cryptoDatabasePrefix: `grungus_${encodeURIComponent(session.userId)}_${session.deviceId}`,
      });
      if (this.client !== client) throw new Error("The Matrix session ended during initialization.");
      await client.startClient({ initialSyncLimit: 40 });
      if (this.client !== client) throw new Error("The Matrix session ended during initialization.");
    } catch (error) {
      this.detachSdkListeners(client);
      client.stopClient();
      if (this.client === client) {
        await this.stop();
        this.updateStatus({ state: "error", error: errorMessage(error) });
      }
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.directCalls.dispose();
    this.closedDirectRooms.clear();
    this.timelineLoads.clear();
    this.notifications.clear();
    this.profileAvatars?.dispose(); this.profileAvatars = null;
    this.avatars?.clear(); this.avatars = null;
    this.identity.dispose();
    this.pendingDirectRooms.clear();
    const client = this.client;
    if (client) {
      this.detachSdkListeners(client);
      client.stopClient();
    }
    this.client = null;
    this.session = null;
    this.roomMapper = null;
    this.messageMapper = null;
    this.hasPrepared = false;
    this.updateStatus({ state: "stopped", error: null });
  }

  async logout(): Promise<void> {
    const client = this.client;
    await this.stop();
    if (client) await client.logout(false);
  }

  getRooms(): MatrixRoom[] {
    const client = this.requireClient();
    const mapper = this.requireRoomMapper();
    return client
      .getRooms()
      .filter((room) => ["join", "invite"].includes(room.getMyMembership()))
      .map((room) => mapper.map(room))
      .sort((left, right) => {
        const unreadDelta = right.highlightCount - left.highlightCount;
        return unreadDelta || left.name.localeCompare(right.name);
      });
  }

  getRoom(roomId: string): MatrixRoom | null {
    const room = this.requireClient().getRoom(roomId);
    return room ? this.requireRoomMapper().map(room) : null;
  }

  discoverSpaceRooms = async (spaceId: string): Promise<MatrixRoom[]> => {
    const client = this.requireClient();
    const rooms = await discoverSpaceRooms(client, spaceId, url => this.resolveMediaUrl(url, 80, 80));
    // Matrix room membership lets us observe who is in voice. It does not join
    // the media call or request microphone/camera access.
    void (async () => {
      for (const room of rooms) {
        if (this.client !== client || client.getRoom(spaceId)?.getMyMembership() !== "join") return;
        if (!isVoiceRoom(room) || !canJoinChannel(room) || client.getRoom(room.id)?.getMyMembership() === "join") continue;
        try { await this.joinRoom(room.id, room.viaServers); }
        catch { /* The server remains authoritative; an explicit join shows the error. */ }
      }
    })();
    return rooms;
  };

  async joinRoom(roomIdOrAlias: string, viaServers?: string[]): Promise<MatrixRoom> {
    const client = this.requireClient();
    const inviter = client.getRoom(roomIdOrAlias)?.getDMInviter();
    const room = await client.joinRoom(roomIdOrAlias, { viaServers });
    this.assertCurrent(client);
    const joined = await this.waitForJoinedRoom(room.roomId);
    this.assertCurrent(client);
    const peer = inviter ?? joined.getDMInviter();
    if (peer && peer !== client.getUserId()) {
      const direct = client.getAccountData(EventType.Direct)?.getContent() ?? {};
      try {
        await client.setAccountData(EventType.Direct, { ...direct, [peer]: [...new Set([...(direct[peer] ?? []), room.roomId])] });
      } catch {
        this.assertCurrent(client);
        this.emit("roomsChanged", this.getRooms());
        throw new Error("Invitation accepted, but saving the direct message failed. Open the conversation from your room list.");
      }
    }
    this.assertCurrent(client);
    const mapped = this.requireRoomMapper().map(joined);
    this.emit("roomsChanged", this.getRooms());
    return mapped;
  }

  async leaveRoom(roomId: string): Promise<void> {
    const client = this.requireClient();
    await client.leave(roomId);
    this.assertCurrent(client);
    this.emit("roomsChanged", this.getRooms());
  }

  private waitForJoinedRoom(roomId: string): Promise<Room> {
    const client = this.requireClient();
    const current = client.getRoom(roomId);
    if (current?.getMyMembership() === "join") return Promise.resolve(current);
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timeout);
        client.off(RoomEvent.MyMembership, check);
        client.off(ClientEvent.Room, check);
        client.off(ClientEvent.Sync, check);
      };
      const check = () => {
        const room = client.getRoom(roomId);
        if (room?.getMyMembership() === "join") { cleanup(); resolve(room); }
      };
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error("The room was joined, but sync has not caught up. Check your connection and try again."));
      }, 15_000);
      client.on(RoomEvent.MyMembership, check);
      client.on(ClientEvent.Room, check);
      client.on(ClientEvent.Sync, check);
      check();
    });
  }

  async inviteUser(roomId: string, userId: string): Promise<void> {
    this.validateUserId(userId);
    await this.requireClient().invite(roomId, userId.trim());
  }

  async searchUsers(term: string): Promise<MatrixUser[]> {
    const client = this.requireClient();
    const response = await client.searchUserDirectory({ term: term.trim(), limit: 20 });
    this.assertCurrent(client);
    return response.results.filter((user) => user.user_id !== client.getUserId()).map((user) => ({
      id: user.user_id, displayName: user.display_name || user.user_id,
      avatarUrl: this.resolveMediaUrl(user.avatar_url ?? null, 80, 80),
    }));
  }

  private validateUserId(userId: string): void {
    if (!/^@[^\s:]+:[^\s]+$/.test(userId.trim())) throw new Error("Enter a full Matrix ID, such as @alice:example.org.");
    if (userId.trim() === this.requireClient().getUserId()) throw new Error("Choose someone other than yourself.");
  }

  async startDirectMessage(userId: string): Promise<MatrixRoom> {
    this.validateUserId(userId);
    const peer = userId.trim();
    const client = this.requireClient();
    const direct = client.getAccountData(EventType.Direct)?.getContent() ?? {};
    for (const id of direct[peer] ?? []) {
      const existing = client.getRoom(id);
      if (existing?.getMyMembership() === "join") {
        if (this.closedDirectRooms.has(id)) await this.setDirectMessageClosed(id, false);
        this.assertCurrent(client);
        return this.requireRoomMapper().map(existing);
      }
      if (existing?.getMyMembership() === "invite") return this.joinRoom(id);
    }
    const recovered = client.getRooms().find(room => room.getMyMembership() === "join" && !room.isSpaceRoom?.() && directInvitePeer(room, client.getUserId()) === peer);
    if (recovered) {
      await client.setAccountData(EventType.Direct, { ...direct, [peer]: [...new Set([...(direct[peer] ?? []), recovered.roomId])] });
      this.assertCurrent(client);
      const mapped = this.requireRoomMapper().map(recovered);
      mapped.isDirect = true;
      this.emit("roomUpdated", mapped);
      return mapped;
    }
    let roomId = this.pendingDirectRooms.get(peer);
    if (!roomId) {
      const created = await client.createRoom({
        is_direct: true, invite: [peer], preset: Preset.TrustedPrivateChat,
        initial_state: [{ type: EventType.RoomEncryption, state_key: "", content: { algorithm: "m.megolm.v1.aes-sha2" } }],
      });
      this.assertCurrent(client);
      roomId = created.room_id;
      this.pendingDirectRooms.set(peer, roomId);
    }
    try {
      const latest = client.getAccountData(EventType.Direct)?.getContent() ?? {};
      await client.setAccountData(EventType.Direct, { ...latest, [peer]: [...new Set([...(latest[peer] ?? []), roomId])] });
    } catch {
      this.assertCurrent(client);
      this.emit("roomsChanged", this.getRooms());
      throw new Error("Conversation created, but saving it to direct messages failed. Try Message again to finish setting it up.");
    }
    this.assertCurrent(client);
    const room = await this.waitForJoinedRoom(roomId);
    this.assertCurrent(client);
    const mapped = this.requireRoomMapper().map(room);
    mapped.isDirect = true;
    this.pendingDirectRooms.delete(peer);
    this.emit("roomUpdated", mapped);
    return mapped;
  }

  setDirectMessageClosed(roomId: string, closed: boolean): Promise<void> {
    const client = this.client;
    const job = this.closedDirectRoomQueue.catch(() => undefined).then(() => {
      if (this.client !== client) return;
      return this.persistDirectMessageClosed(roomId, closed);
    });
    this.closedDirectRoomQueue = job;
    return job;
  }

  private async persistDirectMessageClosed(roomId: string, closed: boolean): Promise<void> {
    const client = this.requireClient();
    const room = this.requireRoom(roomId);
    if (!this.requireRoomMapper().map(room).isDirect) throw new Error("Only direct conversations can be closed.");
    if (this.closedDirectRooms.has(roomId) === closed) return;
    const next = new Set(this.closedDirectRooms);
    if (closed) next.add(roomId); else next.delete(roomId);
    await client.setAccountData(closedDirectRoomsEvent, { rooms: [...next] });
    if (this.client !== client) return;
    this.closedDirectRooms = next;
    this.emit("roomsChanged", this.getRooms());
  }

  searchMessages(query: MessageSearchQuery, signal?: AbortSignal, onProgress?: (result: MessageSearchResults) => void) {
    return searchMatrixMessages(this.requireClient(), query, (event, room) => this.mapMessage(event, room), signal, onProgress);
  }
  async getMessageContext(roomId: string, eventId: string): Promise<MatrixMessage[]> {
    const client = this.requireClient(); const room = this.requireRoom(roomId);
    if (room.getMyMembership() !== "join") throw new Error("Join this room before opening its history.");
    const timeline = await client.getEventTimeline(room.getUnfilteredTimelineSet(), eventId);
    this.assertCurrent(client);
    if (!timeline) throw new Error("This message is no longer available.");
    const events = timeline.getEvents();
    await Promise.allSettled(events.map(event => client.decryptEventIfNeeded(event)));
    return events.map(event => this.mapMessage(event, room)).filter((message): message is MatrixMessage => message !== null);
  }
  getTimeline(roomId: string): MatrixMessage[] {
    return this.mapRoomTimeline(this.requireRoom(roomId));
  }

  private mapRoomTimeline(room: Room): MatrixMessage[] {
    const events = collectTimelineEvents(room.getLiveTimeline());
    for (const event of events) {
      if (event.getType() === EventType.RoomMessageEncrypted && !event.isRedacted() && !event.isBeingDecrypted()) {
        void this.requireClient().decryptEventIfNeeded(event).catch(() => undefined);
      }
    }
    return events
      .map((event) => this.mapMessage(event, room))
      .filter((message): message is MatrixMessage => message !== null)
      .sort((left, right) => left.timestamp - right.timestamp);
  }

  refreshTimeline(roomId: string): Promise<MatrixMessage[]> {
    const existing = this.timelineLoads.get(roomId);
    if (existing) return existing;
    const client = this.requireClient();
    const room = this.requireRoom(roomId);
    const job = loadLatestRoomEvents(client, room).then(events => {
      if (this.client !== client) return [];
      this.emitRoomUpdate(room);
      const messages: MatrixMessage[] = [];
      for (const event of events) {
        const message = this.mapMessage(event, room);
        if (message) messages.push(message);
        else if (event.getId()) this.emit("messageRemoved", { roomId, eventId: event.getId()!, placeholderOnly: true });
      }
      return messages;
    });
    this.timelineLoads.set(roomId, job);
    void job.finally(() => { if (this.timelineLoads.get(roomId) === job) this.timelineLoads.delete(roomId); }).catch(() => undefined);
    return job;
  }

  async loadOlderMessages(roomId: string, limit = 30): Promise<MatrixTimelinePage> {
    const client = this.requireClient();
    const room = this.requireRoom(roomId);
    const timeline = oldestLoadedTimeline(room.getLiveTimeline());
    const hasMore = await client.paginateEventTimeline(timeline, {
      backwards: true,
      limit,
    });
    this.assertCurrent(client);
    return {
      messages: this.getTimeline(roomId),
      hasMore:
        hasMore && timeline.getPaginationToken(Direction.Backward) !== null,
    };
  }

  async sendTextMessage(
    roomId: string,
    body: string,
    options: MatrixSendTextOptions = {},
  ): Promise<string> {
    const trimmed = body.trim();
    if (!trimmed) throw new Error("A message cannot be empty.");
    const content: {
      msgtype: MsgType.Text;
      body: string;
      "m.relates_to"?: { "m.in_reply_to": { event_id: string } };
      "m.mentions": { user_ids: string[] };
      format?: "org.matrix.custom.html";
      formatted_body?: string;
    } = { msgtype: MsgType.Text, body: trimmed, ...createMentionContent(trimmed, this.getRoomMembers(roomId).filter(member => member.membership === "join")) };
    if (options.replyToEventId) {
      content["m.relates_to"] = {
        "m.in_reply_to": { event_id: options.replyToEventId },
      };
    }
    const pending = new Set(this.pendingEvents(roomId).map(event => event.getId()));
    const response = await this.requireClient().sendEvent(
      roomId,
      EventType.RoomMessage,
      content,
    ).catch(error => { throw this.pendingSendError(roomId, pending, error, trimmed); });
    return response.event_id;
  }

  async createPoll(roomId: string, input: PollInput): Promise<string> {
    const event = createPollEvent(input);
    this.requireRoom(roomId);
    const pending = new Set(this.pendingEvents(roomId).map(event => event.getId()));
    const response = await this.requireClient().sendEvent(roomId, event.type as keyof TimelineEvents, event.content as TimelineEvents[keyof TimelineEvents])
      .catch(error => { throw this.pendingSendError(roomId, pending, error, input.question); });
    return response.event_id;
  }
  observePoll(roomId: string, eventId: string, listener: (poll: PollSnapshot) => void) { return observeMatrixPoll(this.requireClient(), this.requireRoom(roomId), eventId, listener); }
  votePoll(roomId: string, eventId: string, answers: string[]) { const client = this.requireClient(); return sendPollVote(client, this.requireRoom(roomId), eventId, answers, () => this.assertCurrent(client)); }
  endPoll(roomId: string, eventId: string) { return closeMatrixPoll(this.requireClient(), this.requireRoom(roomId), eventId); }

  getUploadLimit = () => getUploadLimit(this.requireClient());
  sendAttachment(roomId: string, file: File, onProgress?: (percent: number) => void, options?: MatrixSendTextOptions) {
    const pending = new Set(this.pendingEvents(roomId).map(event => event.getId()));
    return sendAttachment(this.requireClient(), roomId, file, onProgress, options).catch(error => { throw this.pendingSendError(roomId, pending, error, file.name); });
  }
  private pendingEvents(roomId: string): MatrixEvent[] {
    const room = this.requireRoom(roomId);
    try { if (room.getPendingEvents) return room.getPendingEvents(); } catch { /* Chronological local echoes live in the timeline. */ }
    return collectTimelineEvents(room.getLiveTimeline()).filter(event => event.status != null);
  }
  private pendingSendError(roomId: string, previous: Set<string | undefined>, cause: unknown, body: string): Error {
    const attached = cause && typeof cause === "object" && "event" in cause ? (cause as { event?: MatrixEvent }).event : undefined;
    const event = attached?.getRoomId() === roomId && attached.status === EventStatus.NOT_SENT ? attached : this.pendingEvents(roomId).find(event => !previous.has(event.getId()) && event.status === EventStatus.NOT_SENT && event.getContent().body === body);
    const message = cause instanceof Error ? cause.message : "Message could not be sent.";
    return event?.getId() ? new PendingMessageError(message, event.getId()!) : cause instanceof Error ? cause : new Error(message);
  }
  async retryMessage(roomId: string, eventId: string): Promise<void> {
    const room = this.requireRoom(roomId);
    const event = this.pendingEvents(roomId).find(event => event.getId() === eventId);
    if (!event || event.status !== EventStatus.NOT_SENT || event.getSender() !== this.requireClient().getUserId()) throw new Error("This message is already sent or cannot be retried.");
    await this.requireClient().resendEvent(event, room);
  }
  async cancelSend(roomId: string, eventId: string): Promise<void> {
    const room = this.requireRoom(roomId);
    const event = this.pendingEvents(roomId).find(event => event.getId() === eventId);
    if (!event || ![EventStatus.NOT_SENT, EventStatus.QUEUED].includes(event.status!) || event.getSender() !== this.requireClient().getUserId()) throw new Error("Only failed or queued messages can be cancelled.");
    this.requireClient().cancelPendingEvent(event);
    this.emit("messageRemoved", { roomId, eventId });
  }
  loadAttachment = (attachment: MessageAttachment, signal?: AbortSignal) => loadAttachment(this.requireClient(), attachment, signal);

  async editMessage(roomId: string, eventId: string, body: string): Promise<string> {
    const trimmed = body.trim();
    if (!trimmed) throw new Error("A message cannot be empty.");
    const original = this.requireRoom(roomId).findEventById(eventId)?.getContent();
    const msgtype = original?.msgtype === MsgType.Notice ? MsgType.Notice : original?.msgtype === MsgType.Emote ? MsgType.Emote : MsgType.Text;
    const members = this.getRoomMembers(roomId).filter(member => member.membership === "join");
    const mentions = createMentionContent(trimmed, members);
    const previousMentions = original?.["m.mentions"]?.user_ids ?? createMentionContent(original?.body ?? "", members)["m.mentions"].user_ids;
    const newContent = { msgtype, body: trimmed, ...mentions, ...(original?.["m.relates_to"] ? { "m.relates_to": original["m.relates_to"] } : {}) } as const;
    const response = await this.requireClient().sendEvent(
      roomId,
      EventType.RoomMessage,
      {
        msgtype,
        body: `* ${trimmed}`,
        ...mentions,
        "m.mentions": { user_ids: mentions["m.mentions"].user_ids.filter(id => !previousMentions.includes(id)) },
        "m.new_content": newContent,
        "m.relates_to": { rel_type: RelationType.Replace, event_id: eventId },
      },
    );
    return response.event_id;
  }

  async redactMessage(roomId: string, eventId: string, reason?: string): Promise<void> {
    await this.requireClient().redactEvent(roomId, eventId, undefined, { reason });
  }

  async setMessagePinned(roomId: string, eventId: string, pinned: boolean): Promise<void> {
    const room = this.requireRoom(roomId);
    const client = this.requireClient();
    if (!room.currentState.maySendStateEvent(EventType.RoomPinnedEvents, client.getUserId() ?? "")) {
      throw new Error("You do not have permission to pin messages in this room.");
    }
    const current: string[] = room.currentState.getStateEvents(EventType.RoomPinnedEvents, "")?.getContent().pinned ?? [];
    const next = current.filter(id => id !== eventId);
    if (pinned) next.push(eventId);
    await client.sendStateEvent(roomId, EventType.RoomPinnedEvents, { pinned: next }, "");
  }

  async setTyping(roomId: string, typing: boolean): Promise<void> {
    await this.requireClient().sendTyping(roomId, typing, 8_000);
  }

  async sendReadReceipt(roomId: string, eventId: string): Promise<void> {
    const room = this.requireRoom(roomId);
    const event = room.findEventById(eventId);
    if (event) await this.requireClient().sendReadReceipt(event);
  }

  async addReaction(roomId: string, eventId: string, key: string): Promise<string> {
    const response = await this.requireClient().sendEvent(roomId, EventType.Reaction, {
      "m.relates_to": {
        rel_type: RelationType.Annotation,
        event_id: eventId,
        key,
      },
    });
    return response.event_id;
  }

  async removeReaction(roomId: string, reactionEventId: string): Promise<void> {
    await this.redactMessage(roomId, reactionEventId);
  }

  getRoomMembers(roomId: string): MatrixRoomMember[] {
    // Sync can announce rooms before storing them; contact reads wait for that gap.
    const room = this.requireClient().getRoom(roomId);
    if (!room) return [];
    const mapper = this.requireRoomMapper();
    return room
      .getMembers()
      .map((member) => mapper.mapMember(member))
      .sort((left, right) => left.displayName.localeCompare(right.displayName));
  }

  resolveMediaUrl(
    mxcUrl: string | null,
    width?: number,
    height?: number,
  ): string | null {
    if (!mxcUrl) return null;
    return (
      getHttpUriForMxc(this.requireClient().getHomeserverUrl(), mxcUrl, width, height, "scale", false, true, true) || null
    );
  }

  private attachSdkListeners(client: MatrixClient): void {
    // Receive every reported status, including the first offline presence event
    // when the SDK's default presence value has not changed.
    client.on(UserEvent.LastPresenceTs, this.handlePresence);
    client.on(UserEvent.AvatarUrl, this.handleProfileUpdate);
    client.on(UserEvent.DisplayName, this.handleProfileUpdate);
    client.on(MatrixEventEvent.Decrypted, this.handleDecrypted);
    client.on(ClientEvent.Sync, this.handleSync);
    client.on(ClientEvent.Room, this.handleRoom);
    client.on(ClientEvent.AccountData, this.handleAccountData);
    client.on(RoomEvent.Timeline, this.handleTimeline);
    client.on(RoomEvent.LocalEchoUpdated, this.handleLocalEcho);
    client.on(RoomEvent.Name, this.handleRoomUpdate);
    client.on(RoomEvent.MyMembership, this.handleMembership);
    client.on(RoomStateEvent.Events, this.handleStateEvent);
    client.on(RoomEvent.Redaction, this.handleRedaction);
    client.on(RoomEvent.Receipt, this.handleReceipt);
    client.on(RoomMemberEvent.Typing, this.handleTyping);
  }

  private detachSdkListeners(client: MatrixClient): void {
    client.off(UserEvent.LastPresenceTs, this.handlePresence);
    client.off(UserEvent.AvatarUrl, this.handleProfileUpdate);
    client.off(UserEvent.DisplayName, this.handleProfileUpdate);
    client.off(MatrixEventEvent.Decrypted, this.handleDecrypted);
    client.off(ClientEvent.Sync, this.handleSync);
    client.off(ClientEvent.Room, this.handleRoom);
    client.off(ClientEvent.AccountData, this.handleAccountData);
    client.off(RoomEvent.Timeline, this.handleTimeline);
    client.off(RoomEvent.LocalEchoUpdated, this.handleLocalEcho);
    client.off(RoomEvent.Name, this.handleRoomUpdate);
    client.off(RoomEvent.MyMembership, this.handleMembership);
    client.off(RoomStateEvent.Events, this.handleStateEvent);
    client.off(RoomEvent.Redaction, this.handleRedaction);
    client.off(RoomEvent.Receipt, this.handleReceipt);
    client.off(RoomMemberEvent.Typing, this.handleTyping);
  }

  private handleSync = (
    state: SyncState,
    _previous: SyncState | null,
    data?: SyncStateData,
  ): void => {
    if (state === SyncState.Prepared) {
      this.closedDirectRooms = new Set(closedDirectRoomIds(this.requireClient().getAccountData(closedDirectRoomsEvent)?.getContent()));
      this.hasPrepared = true;
      this.updateStatus({ state: "ready", error: null });
      this.emit("roomsChanged", this.getRooms());
      void this.identity.refresh().catch(() => undefined);
      void this.reconcileMemberships().catch(error => console.warn("Unable to reconcile joined rooms", errorMessage(error)));
    } else if (state === SyncState.Syncing) {
      this.updateStatus({
        state: this.hasPrepared ? "ready" : "synchronizing",
        error: null,
      });
    } else if (state === SyncState.Error) {
      this.updateStatus({ state: "error", error: errorMessage(data?.error) });
    } else if (state === SyncState.Stopped) {
      this.updateStatus({ state: "stopped", error: null });
    } else {
      this.updateStatus({ state: "synchronizing", error: null });
    }
  };

  private handleRoom = (room: Room): void => {
    if (["join", "invite"].includes(room.getMyMembership())) {
      this.emit("roomUpdated", this.requireRoomMapper().map(room));
    }
    this.emit("roomsChanged", this.getRooms());
  };

  private handleDecrypted = (event: MatrixEvent): void => {
    const roomId = event.getRoomId();
    const room = roomId ? this.client?.getRoom(roomId) : null;
    if (!room) return;
    this.notifications.decrypted(this.requireClient(), event, room);
    const message = this.mapMessage(event, room);
    if (message) this.emit("messageUpdated", message);
    else {
      const eventId = event.getId();
      if (eventId) this.emit("messageRemoved", { roomId: room.roomId, eventId, placeholderOnly: true });
      this.refreshRelationParent(event, room);
    }
  };

  private handleRoomUpdate = (room: Room): void => this.emitRoomUpdate(room);

  private handleAccountData = (event: MatrixEvent): void => {
    if (event.getType() === closedDirectRoomsEvent) {
      this.closedDirectRooms = new Set(closedDirectRoomIds(event.getContent()));
      this.emit("roomsChanged", this.getRooms());
    }
    if (event.getType() === EventType.IgnoredUserList) blockedUsers.update(Object.keys(event.getContent().ignored_users ?? {}));
    if (event.getType() === EventType.Direct) this.emit("roomsChanged", this.getRooms());
  };

  private handleMembership = (room: Room): void => {
    this.membershipChanges.set(room, (this.membershipChanges.get(room) ?? 0) + 1);
    this.emitRoomUpdate(room);
    this.emit("roomsChanged", this.getRooms());
  };

  private async reconcileMemberships(): Promise<void> {
    const client = this.requireClient();
    const revisions = new Map(client.getRooms().map(room => [room, this.membershipChanges.get(room) ?? 0]));
    const { joined_rooms } = await client.getJoinedRooms();
    if (this.client !== client) return;
    for (const roomId of joined_rooms) {
      const room = client.getRoom(roomId);
      if (!room || room.getMyMembership() === "join") continue;
      // A newer sync membership event takes precedence over this request.
      if (!revisions.has(room) || revisions.get(room) !== (this.membershipChanges.get(room) ?? 0)) continue;
      room.updateMyMembership("join");
    }
    this.emit("roomsChanged", this.getRooms());
  }

  private handleStateEvent = (
    event: MatrixEvent,
    state: RoomState,
  ): void => {
    const room = this.client?.getRoom(state.roomId);
    if (room) this.emitRoomUpdate(room);
    if (room && (event.getType() === EventType.RoomPinnedEvents || event.getType() === EventType.RoomPowerLevels)) {
      for (const message of this.getTimeline(room.roomId)) this.emit("messageUpdated", message);
    }
    if (room && this.hasPrepared && event.getType() === EventType.RoomMember) {
      // RoomState.events fires before the SDK updates RoomMember's avatar.
      const client = this.client;
      queueMicrotask(() => {
        if (this.client === client) this.refreshUserAvatars(event.getStateKey()!);
      });
    }
  };

  private refreshUserAvatars = (userId: string): void => {
    if (!this.client) return;
    for (const room of this.client.getRooms()) {
      this.emitRoomUpdate(room);
      for (const event of collectTimelineEvents(room.getLiveTimeline())) {
        if (event.getSender() !== userId) continue;
        const message = this.mapMessage(event, room);
        if (message) this.emit("messageUpdated", message);
      }
    }
  };

  private handlePresence = (_event: MatrixEvent | undefined, user: User): void => {
    this.emit("presenceChanged", { userId: user.userId, presence: matrixPresence(user.events.presence?.getContent().presence) });
  };

  private handleProfileUpdate = (_event: MatrixEvent | undefined, user: User): void => {
    if (user.userId === this.session?.userId) this.emit("profileUpdated", {
      id: user.userId, displayName: user.displayName || user.userId,
      avatarUrl: this.resolveMediaUrl(user.avatarUrl || null, 96, 96),
    });
  };

  private handleTimeline = (
    event: MatrixEvent,
    room: Room | undefined,
    toStartOfTimeline: boolean | undefined,
    removed: boolean,
  ): void => {
    if (!room) return;
    if (this.hasPrepared && !toStartOfTimeline && !removed) this.notifications.live(this.requireClient(), event, room);
    if (removed) {
      const eventId = event.getId();
      if (eventId) this.emit("messageRemoved", { roomId: room.roomId, eventId });
      return;
    }

    const relation = event.getRelation();
    if (event.getType() === EventType.Reaction || relation?.rel_type === RelationType.Replace) {
      const parentId = relation?.event_id;
      const parent = parentId ? room.findEventById(parentId) : undefined;
      const mappedParent = parent
        ? this.mapMessage(parent, room)
        : null;
      if (mappedParent) this.emit("messageUpdated", mappedParent);
      return;
    }

    const message = this.mapMessage(event, room);
    if (message) this.emit(toStartOfTimeline ? "messageUpdated" : "messageAdded", message);
  };

  private handleLocalEcho = (
    event: MatrixEvent,
    room: Room,
    oldEventId?: string,
    _oldStatus?: EventStatus | null,
  ): void => {
    if (event.getType() === EventType.Reaction || event.getRelation()?.rel_type === RelationType.Replace) {
      this.refreshRelationParent(event, room);
      return;
    }
    const currentId = event.getId();
    if (oldEventId && oldEventId !== currentId) {
      this.emit("messageRemoved", { roomId: room.roomId, eventId: oldEventId });
    }
    const mapped = this.mapMessage(event, room);
    if (mapped) this.emit("messageUpdated", mapped);
  };

  private handleRedaction = (event: MatrixEvent, room: Room): void => {
    const targetId = event.getAssociatedId();
    const target = targetId ? room.findEventById(targetId) : undefined;
    if (target?.getType() === EventType.Reaction) {
      // A redacted reaction no longer contains its parent relation.
      for (const message of this.mapRoomTimeline(room)) this.emit("messageUpdated", message);
      return;
    }
    const mapped = target ? this.mapMessage(target, room) : null;
    if (mapped) this.emit("messageUpdated", mapped);
    else if (targetId) {
      this.emit("messageRemoved", { roomId: room.roomId, eventId: targetId });
    }
  };

  private refreshRelationParent(event: MatrixEvent, room: Room): void {
    const parentId = event.getRelation()?.event_id;
    const parent = parentId ? room.findEventById(parentId) : undefined;
    const mapped = parent ? this.mapMessage(parent, room) : null;
    if (mapped) this.emit("messageUpdated", mapped);
  }

  private handleReceipt = (_event: MatrixEvent, room: Room): void => {
    this.emit("receiptsChanged", { roomId: room.roomId });
    this.emitRoomUpdate(room);
  };

  private handleTyping = (_event: MatrixEvent, member: RoomMember): void => {
    const room = this.client?.getRoom(member.roomId);
    if (!room) return;
    const mapper = this.requireRoomMapper();
    this.emit("typingChanged", {
      roomId: room.roomId,
      members: room
        .getJoinedMembers()
        .filter((candidate) => candidate.typing)
        .map((candidate) => mapper.mapMember(candidate)),
    });
  };

  private emitRoomUpdate(room: Room): void {
    if (!["join", "invite"].includes(room.getMyMembership())) return;
    this.emit("roomUpdated", this.requireRoomMapper().map(room));
  }

  private updateStatus(status: MatrixSyncStatus): void {
    this.status = status;
    this.emit("syncStateChanged", status);
  }

  private emit<K extends MatrixEventName>(
    event: K,
    payload: MatrixApplicationEvents[K],
  ): void {
    for (const listener of this.listeners.get(event) ?? []) listener(payload);
  }

  private assertCurrent(client: MatrixClient): void {
    if (this.client !== client) throw new Error("The Matrix session changed.");
  }

  private requireClient(): MatrixClient {
    if (!this.client) throw new Error("The Matrix client is not connected.");
    return this.client;
  }

  private requireRoom(roomId: string): Room {
    const room = this.requireClient().getRoom(roomId);
    if (!room) throw new Error("The Matrix room is not available.");
    return room;
  }

  private requireRoomMapper(): MatrixRoomMapper {
    if (!this.roomMapper) throw new Error("The Matrix client is not connected.");
    return this.roomMapper;
  }

  private mapMessage(event: MatrixEvent, room: Room): MatrixMessage | null {
    try {
      return this.requireMessageMapper().map(event, room);
    } catch (error) {
      console.warn("Unable to map a Matrix timeline event", error);
      return null;
    }
  }
  private requireMessageMapper(): MatrixMessageMapper {
    if (!this.messageMapper) throw new Error("The Matrix client is not connected.");
    return this.messageMapper;
  }
}




