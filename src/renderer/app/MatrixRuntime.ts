import { membershipNotices } from "../../domain/matrix/MembershipNotices";
import type { PollInput, PollSnapshot } from "../../domain/messaging/Polls";
import { hiddenTopChannels } from "../../domain/settings/HiddenTopChannels";
import type { MessageAttachment } from "../../domain/messaging/Attachments";
import type { IMatrixAuthProvider } from "../../domain/matrix/IMatrixAuthProvider";
import type { IMatrixClient } from "../../domain/matrix/IMatrixClient";
import { preferences } from "../../domain/settings/Preferences";
import type { MessageSearchQuery, MessageSearchResults } from "../../domain/messaging/MessageSearch";
import type {
  MatrixAuthCapabilities,
  MatrixMessage,
  MatrixRoom,
  MatrixRoomMember,
  MatrixSession,
  MatrixSyncStatus,
  MatrixRegistrationAuth,
  MatrixRegistrationChallenge,
  MatrixIdentityState,
  MatrixUser,
  MatrixPresence,
} from "../../domain/matrix/MatrixTypes";

export type MatrixSessionPhase =
  | "restoring"
  | "signed-out"
  | "authenticating"
  | "connected";

export interface MatrixRuntimeSnapshot {
  phase: MatrixSessionPhase;
  session: MatrixSession | null;
  sync: MatrixSyncStatus;
  rooms: MatrixRoom[];
  spaceRooms: Readonly<Record<string, MatrixRoom[]>>;
  selectedRoomId: string | null;
  timelines: Readonly<Record<string, MatrixMessage[]>>;
  typing: Readonly<Record<string, MatrixRoomMember[]>>;
  discovery: MatrixAuthCapabilities | null;
  discoveryPending: boolean;
  browserLoginPending: boolean;
  error: string | null;
  persistenceWarning: string | null;
  registrationChallenge: MatrixRegistrationChallenge | null;
  identity: MatrixIdentityState | null;
  profile: MatrixUser | null;
  presences: Readonly<Record<string, MatrixPresence>>;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

export class MatrixRuntime {
  private snapshot: MatrixRuntimeSnapshot = {
    phase: "restoring",
    session: null,
    sync: { state: "stopped", error: null },
    rooms: [],
    spaceRooms: {},
    selectedRoomId: null,
    timelines: {},
    typing: {},
    discovery: null,
    discoveryPending: false,
    browserLoginPending: false,
    error: null,
    persistenceWarning: null,
    registrationChallenge: null,
    identity: null,
    profile: null,
    presences: {},
  };
  private listeners = new Set<() => void>();
  private bootstrapPromise: Promise<void> | null = null;
  private browserAttempt = 0;
  private authCallbackCleanup: (() => void) | null = null;
  private readonly spaceDiscoveries = new Map<string, Promise<void>>();
  private readonly hiddenRoomChats = new Set<string>();

  constructor(
    private readonly client: IMatrixClient,
    private readonly auth: IMatrixAuthProvider,
  ) {
    client.subscribe("presenceChanged", ({ userId, presence }) => {
      if (this.snapshot.presences[userId] !== presence) this.update({ presences: { ...this.snapshot.presences, [userId]: presence } });
    });
    client.subscribe("identityChanged", (identity) => this.update({ identity }));
    client.subscribe("profileUpdated", (profile) => {
      if (profile.id === this.snapshot.session?.userId) this.update({ profile });
    });
    client.subscribe("syncStateChanged", (sync) => this.update({ sync }));
    client.subscribe("roomsChanged", (rooms) => this.update({ rooms }));
    client.subscribe("roomUpdated", (room) => {
      const rooms = this.snapshot.rooms.some((candidate) => candidate.id === room.id)
        ? this.snapshot.rooms.map((candidate) =>
            candidate.id === room.id ? room : candidate,
          )
        : [...this.snapshot.rooms, room];
      this.update({ rooms });
    });
    client.subscribe("messageAdded", (message) => this.upsertMessage(message));
    client.subscribe("messageUpdated", (message) => this.upsertMessage(message));
    client.subscribe("messageRemoved", ({ roomId, eventId, placeholderOnly }) => {
      const timeline = (this.snapshot.timelines[roomId] ?? []).filter(
        (message) => message.id !== eventId || Boolean(placeholderOnly && message.type !== "encrypted"),
      );
      this.update({
        timelines: { ...this.snapshot.timelines, [roomId]: timeline },
      });
    });
    client.subscribe("typingChanged", ({ roomId, members }) => {
      this.update({ typing: { ...this.snapshot.typing, [roomId]: members } });
    });
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): MatrixRuntimeSnapshot => this.snapshot;

  bootstrap(): Promise<void> {
    if (this.bootstrapPromise) return this.bootstrapPromise;
    this.authCallbackCleanup ??= this.auth.subscribeToBrowserCallback((url) => {
      void this.finishBrowserLogin(url);
    });
    this.bootstrapPromise = this.restore().finally(() => {
      this.bootstrapPromise = null;
    });
    return this.bootstrapPromise;
  }

  private async restore(): Promise<void> {
    try {
      const session = await this.auth.restoreSession();
      if (!session) {
        this.update({ phase: "signed-out" });
        return;
      }
      // Keep the startup splash visible until the saved session is ready.
      this.update({ session, error: null });
      await this.client.start(session);
      this.update({
        phase: "connected",
        session,
        rooms: this.client.getRooms(),
      });
      void this.refreshProfile();
    } catch (error) {
      await this.auth.clearSession();
      this.update({
        phase: "signed-out",
        session: null,
        error: `Session restore failed: ${messageOf(error)}`,
      });
    }
  }

  async discover(serverNameOrUrl: string): Promise<void> {
    this.update({ discoveryPending: true, discovery: null, error: null });
    try {
      const discovery = await this.auth.discover(serverNameOrUrl);
      this.update({ discovery, discoveryPending: false });
    } catch (error) {
      this.update({ discoveryPending: false, error: messageOf(error) });
    }
  }

  resetDiscovery(): void {
    this.update({ discovery: null, error: null, registrationChallenge: null });
  }

  cancelRegistration(): void {
    this.update({ registrationChallenge: null, error: null });
  }

  async register(username: string, password: string, auth?: MatrixRegistrationAuth): Promise<void> {
    const discovery = this.snapshot.discovery;
    if (!discovery) return;
    this.update({ phase: "authenticating", error: null });
    try {
      const result = await this.auth.register(discovery, username, password, auth);
      if (result.challenge) {
        this.update({ phase: "signed-out", registrationChallenge: result.challenge });
      } else {
        this.update({ registrationChallenge: null });
        await this.connect(result.session);
      }
    } catch (error) {
      this.update({ phase: "signed-out", error: messageOf(error) });
    }
  }

  async loginWithPassword(user: string, password: string): Promise<void> {
    const discovery = this.snapshot.discovery;
    if (!discovery) return;
    this.update({ phase: "authenticating", error: null });
    try {
      const session = await this.auth.loginWithPassword(
        discovery,
        user,
        password,
      );
      await this.connect(session);
    } catch (error) {
      this.update({ phase: "signed-out", error: messageOf(error) });
    }
  }

  async startBrowserLogin(identityProviderId?: string, register = false): Promise<void> {
    const discovery = this.snapshot.discovery;
    if (!discovery || this.snapshot.phase === "authenticating") return;
    const attempt = ++this.browserAttempt;
    this.update({ phase: "authenticating", browserLoginPending: true, error: null });
    try {
      await this.auth.startBrowserLogin(discovery, { identityProviderId, register });
    } catch (error) {
      if (attempt !== this.browserAttempt) return;
      this.update({ phase: "signed-out", browserLoginPending: false, error: messageOf(error) });
    }
  }

  async cancelBrowserLogin(): Promise<void> {
    if (!this.snapshot.browserLoginPending) return;
    this.browserAttempt++;
    try { await this.auth.cancelBrowserLogin(); }
    catch (error) { this.update({ error: messageOf(error) }); }
    this.update({ phase: "signed-out", browserLoginPending: false });
  }

  private async finishBrowserLogin(url: string): Promise<void> {
    const attempt = this.browserAttempt;
    try {
      const session = await this.auth.completeBrowserLogin(url);
      if (attempt !== this.browserAttempt) return;
      this.update({ browserLoginPending: false });
      await this.connect(session);
    } catch (error) {
      if (attempt !== this.browserAttempt) return;
      this.update({ phase: "signed-out", browserLoginPending: false, error: messageOf(error) });
    }
  }

  private async connect(session: MatrixSession): Promise<void> {
    await this.client.start(session);
    const persistenceWarning = await this.auth.persistSession(session);
    this.update({
      phase: "connected",
      session,
      rooms: this.client.getRooms(),
      error: null,
      persistenceWarning,
    });
    void this.refreshProfile();
  }

  loadAvatar = (url: string) => this.client.loadAvatar(url);
  private async refreshProfile() {
    const userId = this.snapshot.session?.userId;
    try {
      const profile = await this.client.getOwnProfile();
      if (this.snapshot.session?.userId === userId) this.update({ profile });
    } catch { /* An unavailable profile never blocks the Matrix session. */ }
  }

  async logout(): Promise<void> {
    this.hiddenRoomChats.clear();
    membershipNotices.clear();
    this.spaceDiscoveries.clear();
    this.reactionQueues.clear();
    this.update({ phase: "restoring", session: null });
    try {
      await this.client.logout();
    } finally {
      try { await this.auth.clearSession(); }
      finally {
        this.snapshot = {
          ...this.snapshot,
          phase: "signed-out",
          session: null,
          rooms: [],
          spaceRooms: {},
          selectedRoomId: null,
          timelines: {},
          typing: {},
          discovery: null,
          sync: { state: "stopped", error: null },
          error: null,
          persistenceWarning: null,
          registrationChallenge: null,
          identity: null,
          profile: null,
          presences: {},
        };
        this.notify();
      }
    }
  }

  clearSelectedRoom(): void { this.update({ selectedRoomId: null }); }

  setRoomChatVisible(roomId: string, visible: boolean): void {
    if (!visible) { this.hiddenRoomChats.add(roomId); return; }
    this.hiddenRoomChats.delete(roomId);
    const latest = this.snapshot.timelines[roomId]?.at(-1);
    if (this.snapshot.selectedRoomId === roomId && latest?.sendState === "sent" && preferences.getSnapshot().sendReadReceipts) {
      void this.client.sendReadReceipt(roomId, latest.id).catch(() => undefined);
    }
  }

  selectRoom(roomId: string): void {
    const room = this.snapshot.rooms.find((candidate) => candidate.id === roomId);
    if (!room || room.membership !== "join" || room.isSpace) return;
    const timelines = this.snapshot.timelines[roomId]
      ? this.snapshot.timelines
      : { ...this.snapshot.timelines, [roomId]: this.client.getRoom(roomId) ? this.client.getTimeline(roomId) : [] };
    try { hiddenTopChannels.reopen(roomId); } catch (error) { this.update({ error: messageOf(error) }); }
    this.update({ selectedRoomId: roomId, timelines });
    if (room.isDirectClosed) void this.client.setDirectMessageClosed(roomId, false).catch(error => this.update({ error: messageOf(error) }));
    const session = this.snapshot.session;
    void this.client.refreshTimeline(roomId).then(messages => {
      if (this.snapshot.session !== session) return;
      const merged = [...new Map([...(this.snapshot.timelines[roomId] ?? []), ...messages].map(message => [message.id, message])).values()]
        .sort((left, right) => left.timestamp - right.timestamp);
      this.update({ timelines: { ...this.snapshot.timelines, [roomId]: merged } });
      const latest = merged.at(-1);
      if (this.snapshot.selectedRoomId === roomId && !this.hiddenRoomChats.has(roomId) && latest?.sendState === "sent" && preferences.getSnapshot().sendReadReceipts) {
        void this.client.sendReadReceipt(roomId, latest.id).catch(() => undefined);
      }
    }).catch(error => {
      if (this.snapshot.session === session) this.update({ error: `Unable to refresh messages: ${messageOf(error)}` });
    });
    const latest = timelines[roomId]?.at(-1);
    if (!this.hiddenRoomChats.has(roomId) && latest?.sendState === "sent" && preferences.getSnapshot().sendReadReceipts) {
      void this.client.sendReadReceipt(roomId, latest.id);
    }
  }

  discoverSpaceRooms(spaceId: string): Promise<void> {
    const existing = this.spaceDiscoveries.get(spaceId);
    if (existing) return existing;
    const session = this.snapshot.session;
    const request = this.client.discoverSpaceRooms(spaceId).then(rooms => {
      if (this.snapshot.session === session) this.update({ spaceRooms: { ...this.snapshot.spaceRooms, [spaceId]: rooms } });
    }).finally(() => { if (this.spaceDiscoveries.get(spaceId) === request) this.spaceDiscoveries.delete(spaceId); });
    this.spaceDiscoveries.set(spaceId, request);
    return request;
  }

  async joinRoom(roomIdOrAlias: string, viaServers?: string[]): Promise<boolean> {
    const session = this.snapshot.session;
    try {
      const room = await this.client.joinRoom(roomIdOrAlias.trim(), viaServers);
      if (this.snapshot.session !== session) return false;
      this.update({ rooms: this.client.getRooms() });
      this.selectRoom(room.id);
      membershipNotices.publish("join", room);
      return true;
    } catch (error) {
      if (this.snapshot.session === session) this.update({ error: messageOf(error) });
      return false;
    }
  }

  async declineInvite(roomId: string): Promise<boolean> {
    const session = this.snapshot.session;
    try {
      await this.client.leaveRoom(roomId);
      if (this.snapshot.session !== session) return false;
      this.update({ rooms: this.client.getRooms().filter((room) => room.id !== roomId) });
      return true;
    } catch (error) {
      if (this.snapshot.session === session) this.update({ error: messageOf(error) });
      return false;
    }
  }

  async closeDirectMessage(roomId: string): Promise<boolean> {
    const session = this.snapshot.session;
    try {
      const closing = this.snapshot.rooms.find(room => room.id === roomId);
      await this.client.setDirectMessageClosed(roomId, true);
      if (this.snapshot.session !== session) return false;
      const rooms = this.client.getRooms();
      this.update({ rooms });
      if (this.snapshot.selectedRoomId === roomId) {
        const remaining = rooms.filter(room => room.id !== roomId && room.isDirect && !room.isDirectClosed && room.membership === "join");
        const next = remaining.find(room => room.name === closing?.name) ?? remaining[0];
        if (next) this.selectRoom(next.id);
        else this.update({ selectedRoomId: null });
      }
      return true;
    } catch (error) {
      if (this.snapshot.session === session) this.update({ error: messageOf(error) });
      return false;
    }
  }

  acceptUserIdentity = (userId: string) => this.client.acceptUserIdentity(userId);
  observeUserVerification = (userId: string, listener: (status: import("../../domain/matrix/MatrixTypes").MatrixPeerVerification) => void) => this.client.observeUserVerification(userId, listener);
  searchUsers(term: string) {
    return this.client.searchUsers(term);
  }
  searchMessages = (query: MessageSearchQuery, signal?: AbortSignal, onProgress?: (result: MessageSearchResults) => void) => {
    const session = this.snapshot.session;
    return this.client.searchMessages(query, signal, result => { if (this.snapshot.session === session) onProgress?.(result); });
  };
  getPinnedMessages = (roomId: string) => this.client.getPinnedMessages(roomId);

  async openSearchResult(message: MatrixMessage): Promise<void> {
    const session = this.snapshot.session;
    const context = await this.client.getMessageContext(message.roomId, message.id);
    if (this.snapshot.session !== session) return;
    const messages = [...new Map([message, ...(this.snapshot.timelines[message.roomId] ?? []), ...context].map(item => [item.id, item])).values()].sort((a, b) => a.timestamp - b.timestamp);
    this.update({ timelines: { ...this.snapshot.timelines, [message.roomId]: messages } });
    this.selectRoom(message.roomId);
  }

  async inviteUser(roomId: string, userId: string): Promise<void> {
    await this.client.inviteUser(roomId, userId);
  }

  async startDirectMessage(userId: string): Promise<void> {
    const session = this.snapshot.session;
    const room = await this.client.startDirectMessage(userId);
    if (this.snapshot.session !== session) return;
    const rooms = [...this.snapshot.rooms.filter((candidate) => candidate.id !== room.id), room];
    this.update({ rooms });
    this.selectRoom(room.id);
  }

  async loadOlder(roomId: string): Promise<boolean> {
    const session = this.snapshot.session;
    try {
      const page = await this.client.loadOlderMessages(roomId);
      if (this.snapshot.session !== session) return false;
      const messages = [...new Map([...(this.snapshot.timelines[roomId] ?? []), ...page.messages].map(message => [message.id, message])).values()]
        .sort((left, right) => left.timestamp - right.timestamp);
      this.update({
        timelines: { ...this.snapshot.timelines, [roomId]: messages },
      });
      return page.hasMore;
    } catch (error) {
      if (this.snapshot.session === session) this.update({ error: messageOf(error) });
      return false;
    }
  }

  async sendMessage(roomId: string, body: string, replyToEventId?: string): Promise<void> {
    const session = this.snapshot.session;
    try {
      await this.client.sendTextMessage(roomId, body, replyToEventId ? { replyToEventId } : undefined);
      if (this.snapshot.session !== session) return;
      await this.client.setTyping(roomId, false);
    } catch (error) {
      if (this.snapshot.session === session) this.update({ error: messageOf(error) });
      throw error;
    }
  }

  getUploadLimit = () => this.client.getUploadLimit();
  retryMessage = (roomId: string, eventId: string) => this.client.retryMessage(roomId, eventId);
  cancelSend = (roomId: string, eventId: string) => this.client.cancelSend(roomId, eventId);
  async sendAttachment(roomId: string, file: File, onProgress?: (percent: number) => void, replyToEventId?: string): Promise<void> {
    const session = this.snapshot.session;
    try { await this.client.sendAttachment(roomId, file, onProgress, replyToEventId ? { replyToEventId } : undefined); }
    catch (error) { if (this.snapshot.session === session) this.update({ error: messageOf(error) }); throw error; }
  }
  loadAttachment = (attachment: MessageAttachment, signal?: AbortSignal) => this.client.loadAttachment(attachment, signal);

  setTyping(roomId: string, typing: boolean): void {
    void this.client.setTyping(roomId, typing).catch(() => undefined);
  }

  createPoll = (roomId: string, input: PollInput) => this.client.createPoll(roomId, input);
  observePoll = (roomId: string, eventId: string, listener: (poll: PollSnapshot) => void) => this.client.observePoll(roomId, eventId, listener);
  votePoll = (roomId: string, eventId: string, answers: string[]) => this.client.votePoll(roomId, eventId, answers);
  endPoll = (roomId: string, eventId: string) => this.client.endPoll(roomId, eventId);

  getRoomMembers(roomId: string) {
    return this.client.getRoomMembers(roomId);
  }

  async editMessage(roomId: string, message: MatrixMessage, body: string): Promise<void> {
    if (!message.isOwn || message.isRedacted) throw new Error("You can only edit your own messages.");
    await this.client.editMessage(roomId, message.id, body);
  }

  async deleteMessage(roomId: string, message: MatrixMessage): Promise<void> {
    if (!message.isOwn || message.isRedacted) throw new Error("You can only delete your own messages.");
    await this.client.redactMessage(roomId, message.id);
  }

  setMessagePinned(roomId: string, message: MatrixMessage): Promise<void> {
    return this.client.setMessagePinned(roomId, message.id, !message.isPinned);
  }

  private readonly reactionQueues = new Map<string, Promise<void>>();

  toggleReaction(roomId: string, message: MatrixMessage, key: string): Promise<void> {
    const session = this.snapshot.session;
    const id = JSON.stringify([roomId, message.id, key]);
    const previous = this.reactionQueues.get(id) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(() => this.snapshot.session === session ? this.applyReaction(roomId, message, key) : undefined);
    this.reactionQueues.set(id, next);
    void next.finally(() => { if (this.reactionQueues.get(id) === next) this.reactionQueues.delete(id); }).catch(() => undefined);
    return next;
  }

  private async applyReaction(roomId: string, message: MatrixMessage, key: string): Promise<void> {
    const latest = this.client.getTimeline(roomId).find(candidate => candidate.id === message.id) ?? message;
    const ownReaction = latest.reactions.find(
      (reaction) => reaction.key === key && reaction.eventId,
    );
    if (ownReaction?.eventId) {
      await this.client.removeReaction(roomId, ownReaction.eventId);
    } else {
      await this.client.addReaction(roomId, message.id, key);
    }
  }

  clearError(): void {
    this.update({ error: null });
  }

  refreshIdentity = () => this.client.refreshIdentity();
  requestIdentityVerification = () => this.client.requestIdentityVerification();
  requestUserVerification = (userId: string) => this.client.requestUserVerification(userId);
  acceptIdentityVerification = () => this.client.acceptIdentityVerification();
  startIdentityComparison = () => this.client.startIdentityComparison();
  confirmIdentityComparison = (matches: boolean) => this.client.confirmIdentityComparison(matches);
  cancelIdentityVerification = () => this.client.cancelIdentityVerification();
  recoverIdentity = (key: string) => this.client.recoverIdentity(key);
  prepareIdentityReset = () => this.client.prepareIdentityReset();
  resetIdentity = (confirmed: boolean) => this.client.resetIdentity(confirmed);
  submitIdentityAuth = (password?: string) => this.client.submitIdentityAuth(password);
  cancelIdentityAuth = () => this.client.cancelIdentityAuth();
  clearIdentitySecrets = () => this.client.clearIdentitySecrets();

  private upsertMessage(message: MatrixMessage): void {
    const current = this.snapshot.timelines[message.roomId];
    if (!current && this.snapshot.selectedRoomId !== message.roomId) return;
    const timeline = current ?? this.client.getTimeline(message.roomId);
    const existing = timeline.findIndex((candidate) => candidate.id === message.id);
    const next =
      existing >= 0
        ? timeline.map((candidate) =>
            candidate.id === message.id ? message : candidate,
          )
        : [...timeline, message];
    next.sort((left, right) => left.timestamp - right.timestamp);
    this.update({
      timelines: { ...this.snapshot.timelines, [message.roomId]: next },
    });
  }

  private update(patch: Partial<MatrixRuntimeSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}
