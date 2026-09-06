import type { IMatrixAuthProvider } from "../../domain/matrix/IMatrixAuthProvider";
import type { IMatrixClient } from "../../domain/matrix/IMatrixClient";
import type {
  MatrixAuthCapabilities,
  MatrixMessage,
  MatrixRoom,
  MatrixRoomMember,
  MatrixSession,
  MatrixSyncStatus,
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
  };
  private listeners = new Set<() => void>();
  private bootstrapPromise: Promise<void> | null = null;
  private authCallbackCleanup: (() => void) | null = null;

  constructor(
    private readonly client: IMatrixClient,
    private readonly auth: IMatrixAuthProvider,
  ) {
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
    client.subscribe("messageRemoved", ({ roomId, eventId }) => {
      const timeline = (this.snapshot.timelines[roomId] ?? []).filter(
        (message) => message.id !== eventId,
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
      this.update({ phase: "authenticating", session, error: null });
      await this.client.start(session);
      this.update({
        phase: "connected",
        session,
        rooms: this.client.getRooms(),
      });
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
    this.update({ discovery: null, error: null });
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

  async startBrowserLogin(identityProviderId?: string): Promise<void> {
    const discovery = this.snapshot.discovery;
    if (!discovery) return;
    this.update({ phase: "authenticating", error: null });
    try {
      await this.auth.startBrowserLogin(discovery, { identityProviderId });
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
      };
      this.notify();
    }
  }

  selectRoom(roomId: string): void {
    const timelines = this.snapshot.timelines[roomId]
      ? this.snapshot.timelines
      : { ...this.snapshot.timelines, [roomId]: this.client.getTimeline(roomId) };
    this.update({ selectedRoomId: roomId, timelines });
    const latest = timelines[roomId]?.at(-1);
    if (latest?.sendState === "sent") {
      void this.client.sendReadReceipt(roomId, latest.id);
    }
  }

  async joinRoom(roomIdOrAlias: string): Promise<void> {
    try {
      const room = await this.client.joinRoom(roomIdOrAlias.trim());
      this.update({ rooms: this.client.getRooms() });
      this.selectRoom(room.id);
    } catch (error) {
      this.update({ error: messageOf(error) });
    }
  }

  async loadOlder(roomId: string): Promise<boolean> {
    try {
      const page = await this.client.loadOlderMessages(roomId);
      this.update({
        timelines: { ...this.snapshot.timelines, [roomId]: page.messages },
      });
      return page.hasMore;
    } catch (error) {
      this.update({ error: messageOf(error) });
      return false;
    }
  }

  async sendMessage(roomId: string, body: string): Promise<void> {
    try {
      await this.client.sendTextMessage(roomId, body);
      await this.client.setTyping(roomId, false);
    } catch (error) {
      this.update({ error: messageOf(error) });
      throw error;
    }
  }

  setTyping(roomId: string, typing: boolean): void {
    void this.client.setTyping(roomId, typing).catch(() => undefined);
  }

  async toggleReaction(roomId: string, message: MatrixMessage, key: string): Promise<void> {
    const ownReaction = message.reactions.find(
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
