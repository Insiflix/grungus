import type { IMatrixAuthProvider } from "../../domain/matrix/IMatrixAuthProvider";
import type { IMatrixClient } from "../../domain/matrix/IMatrixClient";
import { preferences } from "../../domain/settings/Preferences";
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
  selectedRoomId: string | null;
  timelines: Readonly<Record<string, MatrixMessage[]>>;
  typing: Readonly<Record<string, MatrixRoomMember[]>>;
  discovery: MatrixAuthCapabilities | null;
  discoveryPending: boolean;
  error: string | null;
  persistenceWarning: string | null;
  registrationChallenge: MatrixRegistrationChallenge | null;
  identity: MatrixIdentityState | null;
  profile: MatrixUser | null;
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
    selectedRoomId: null,
    timelines: {},
    typing: {},
    discovery: null,
    discoveryPending: false,
    error: null,
    persistenceWarning: null,
    registrationChallenge: null,
    identity: null,
    profile: null,
  };
  private listeners = new Set<() => void>();
  private bootstrapPromise: Promise<void> | null = null;
  private authCallbackCleanup: (() => void) | null = null;

  constructor(
    private readonly client: IMatrixClient,
    private readonly auth: IMatrixAuthProvider,
  ) {
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
    if (!discovery) return;
    this.update({ phase: "authenticating", error: null });
    try {
      await this.auth.startBrowserLogin(discovery, { identityProviderId, register });
    } catch (error) {
      this.update({ phase: "signed-out", error: messageOf(error) });
    }
  }

  private async finishBrowserLogin(url: string): Promise<void> {
    try {
      const session = await this.auth.completeBrowserLogin(url);
      await this.connect(session);
    } catch (error) {
      this.update({ phase: "signed-out", error: messageOf(error) });
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
    try {
      await this.client.logout();
    } finally {
      await this.auth.clearSession();
      this.snapshot = {
        ...this.snapshot,
        phase: "signed-out",
        session: null,
        rooms: [],
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
      };
      this.notify();
    }
  }

  selectRoom(roomId: string): void {
    const room = this.snapshot.rooms.find((candidate) => candidate.id === roomId);
    if (!room || room.membership !== "join" || room.isSpace) return;
    const timelines = this.snapshot.timelines[roomId]
      ? this.snapshot.timelines
      : { ...this.snapshot.timelines, [roomId]: this.client.getRoom(roomId) ? this.client.getTimeline(roomId) : [] };
    this.update({ selectedRoomId: roomId, timelines });
    if (room.isDirectClosed) void this.client.setDirectMessageClosed(roomId, false).catch(error => this.update({ error: messageOf(error) }));
    const session = this.snapshot.session;
    void this.client.refreshTimeline(roomId).then(messages => {
      if (this.snapshot.session !== session) return;
      const merged = [...new Map([...(this.snapshot.timelines[roomId] ?? []), ...messages].map(message => [message.id, message])).values()]
        .sort((left, right) => left.timestamp - right.timestamp);
      this.update({ timelines: { ...this.snapshot.timelines, [roomId]: merged } });
      const latest = merged.at(-1);
      if (this.snapshot.selectedRoomId === roomId && latest?.sendState === "sent" && preferences.getSnapshot().sendReadReceipts) {
        void this.client.sendReadReceipt(roomId, latest.id).catch(() => undefined);
      }
    }).catch(error => {
      if (this.snapshot.session === session) this.update({ error: `Unable to refresh messages: ${messageOf(error)}` });
    });
    const latest = timelines[roomId]?.at(-1);
    if (latest?.sendState === "sent" && preferences.getSnapshot().sendReadReceipts) {
      void this.client.sendReadReceipt(roomId, latest.id);
    }
  }

  async joinRoom(roomIdOrAlias: string): Promise<boolean> {
    try {
      const room = await this.client.joinRoom(roomIdOrAlias.trim());
      this.update({ rooms: this.client.getRooms() });
      this.selectRoom(room.id);
      return true;
    } catch (error) {
      this.update({ error: messageOf(error) });
      return false;
    }
  }

  async declineInvite(roomId: string): Promise<boolean> {
    try {
      await this.client.leaveRoom(roomId);
      this.update({ rooms: this.client.getRooms().filter((room) => room.id !== roomId) });
      return true;
    } catch (error) {
      this.update({ error: messageOf(error) });
      return false;
    }
  }

  async closeDirectMessage(roomId: string): Promise<boolean> {
    try {
      const closing = this.snapshot.rooms.find(room => room.id === roomId);
      await this.client.setDirectMessageClosed(roomId, true);
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
      this.update({ error: messageOf(error) });
      return false;
    }
  }

  searchUsers(term: string) {
    return this.client.searchUsers(term);
  }

  async inviteUser(roomId: string, userId: string): Promise<void> {
    await this.client.inviteUser(roomId, userId);
  }

  async startDirectMessage(userId: string): Promise<void> {
    const room = await this.client.startDirectMessage(userId);
    const rooms = [...this.snapshot.rooms.filter((candidate) => candidate.id !== room.id), room];
    this.update({ rooms });
    this.selectRoom(room.id);
  }

  async loadOlder(roomId: string): Promise<boolean> {
    try {
      const page = await this.client.loadOlderMessages(roomId);
      const messages = [...new Map([...(this.snapshot.timelines[roomId] ?? []), ...page.messages].map(message => [message.id, message])).values()]
        .sort((left, right) => left.timestamp - right.timestamp);
      this.update({
        timelines: { ...this.snapshot.timelines, [roomId]: messages },
      });
      return page.hasMore;
    } catch (error) {
      this.update({ error: messageOf(error) });
      return false;
    }
  }

  async sendMessage(roomId: string, body: string, replyToEventId?: string): Promise<void> {
    try {
      await this.client.sendTextMessage(roomId, body, replyToEventId ? { replyToEventId } : undefined);
      await this.client.setTyping(roomId, false);
    } catch (error) {
      this.update({ error: messageOf(error) });
      throw error;
    }
  }

  setTyping(roomId: string, typing: boolean): void {
    void this.client.setTyping(roomId, typing).catch(() => undefined);
  }

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
    const id = JSON.stringify([roomId, message.id, key]);
    const previous = this.reactionQueues.get(id) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(() => this.applyReaction(roomId, message, key));
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
