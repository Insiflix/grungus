import {
  ClientEvent,
  createClient,
  Direction,
  EventType,
  getHttpUriForMxc,
  MsgType,
  RelationType,
  RoomEvent,
  RoomMemberEvent,
  RoomStateEvent,
  SyncState,
  type EventStatus,
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
} from "../../domain/matrix/MatrixTypes";
import { MatrixMessageMapper } from "./MatrixMessageMapper";
import { MatrixRoomMapper } from "./MatrixRoomMapper";

export interface MatrixJsSdkClientOptions {
  onSessionUpdated?: (session: MatrixSession) => void | Promise<void>;
}

function errorMessage(value: unknown): string {
  return value instanceof Error ? value.message : "Unknown Matrix error";
}

export class MatrixJsSdkClient implements IMatrixClient {
  private client: MatrixClient | null = null;
  private roomMapper: MatrixRoomMapper | null = null;
  private messageMapper: MatrixMessageMapper | null = null;
  private listeners = new Map<MatrixEventName, Set<(payload: unknown) => void>>();
  private session: MatrixSession | null = null;
  private status: MatrixSyncStatus = { state: "stopped", error: null };
  private startPromise: Promise<void> | null = null;
  private hasPrepared = false;

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
      this.session.deviceId === session.deviceId
    ) {
      return this.startPromise ?? Promise.resolve();
    }
    if (this.startPromise) return this.startPromise;

    this.startPromise = this.startInternal(session).finally(() => {
      this.startPromise = null;
    });
    return this.startPromise;
  }

  private async startInternal(session: MatrixSession): Promise<void> {
    if (this.client) await this.stop();
    this.session = session;
    this.hasPrepared = false;
    this.updateStatus({ state: "connecting", error: null });

    let clientRef: MatrixClient | null = null;
    const client = createClient({
      baseUrl: session.homeserverUrl,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      userId: session.userId,
      deviceId: session.deviceId,
      timelineSupport: true,
      tokenRefreshFunction: session.refreshToken
        ? async (refreshToken) => {
            if (!clientRef) throw new Error("Matrix client is not ready to refresh");
            const refreshed = await clientRef.refreshToken(refreshToken);
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
    this.roomMapper = new MatrixRoomMapper(client);
    this.messageMapper = new MatrixMessageMapper(client);
    this.attachSdkListeners(client);

    try {
      await client.initRustCrypto({
        useIndexedDB: true,
        cryptoDatabasePrefix: `grungus_${encodeURIComponent(session.userId)}_${session.deviceId}`,
      });
      await client.startClient({ initialSyncLimit: 40 });
    } catch (error) {
      this.updateStatus({ state: "error", error: errorMessage(error) });
      this.detachSdkListeners(client);
      client.stopClient();
      this.client = null;
      this.roomMapper = null;
      this.messageMapper = null;
      throw error;
    }
  }

  async stop(): Promise<void> {
    const client = this.client;
    if (client) {
      this.detachSdkListeners(client);
      client.stopClient();
    }
    this.client = null;
    this.roomMapper = null;
    this.messageMapper = null;
    this.hasPrepared = false;
    this.updateStatus({ state: "stopped", error: null });
  }

  async logout(): Promise<void> {
    const client = this.client;
    if (client) {
      try {
        await client.logout(false);
      } finally {
        await this.stop();
      }
    }
    this.session = null;
  }

  getRooms(): MatrixRoom[] {
    const client = this.requireClient();
    const mapper = this.requireRoomMapper();
    return client
      .getRooms()
      .filter((room) => room.getMyMembership() === "join" && !room.isSpaceRoom())
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

  async joinRoom(roomIdOrAlias: string): Promise<MatrixRoom> {
    const room = await this.requireClient().joinRoom(roomIdOrAlias);
    const mapped = this.requireRoomMapper().map(room);
    this.emit("roomsChanged", this.getRooms());
    return mapped;
  }

  async leaveRoom(roomId: string): Promise<void> {
    await this.requireClient().leave(roomId);
    this.emit("roomsChanged", this.getRooms());
  }

  getTimeline(roomId: string): MatrixMessage[] {
    const room = this.requireRoom(roomId);
    const mapper = this.requireMessageMapper();
    return room
      .getLiveTimeline()
      .getEvents()
      .map((event) => this.mapMessage(event, room))
      .filter((message): message is MatrixMessage => message !== null)
      .sort((left, right) => left.timestamp - right.timestamp);
  }

  async loadOlderMessages(roomId: string, limit = 30): Promise<MatrixTimelinePage> {
    const client = this.requireClient();
    const room = this.requireRoom(roomId);
    const timeline = room.getLiveTimeline();
    const hasMore = await client.paginateEventTimeline(timeline, {
      backwards: true,
      limit,
    });
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
    } = { msgtype: MsgType.Text, body: trimmed };
    if (options.replyToEventId) {
      content["m.relates_to"] = {
        "m.in_reply_to": { event_id: options.replyToEventId },
      };
    }
    const response = await this.requireClient().sendEvent(
      roomId,
      EventType.RoomMessage,
      content,
    );
    return response.event_id;
  }

  async editMessage(roomId: string, eventId: string, body: string): Promise<string> {
    const trimmed = body.trim();
    if (!trimmed) throw new Error("A message cannot be empty.");
    const response = await this.requireClient().sendEvent(
      roomId,
      EventType.RoomMessage,
      {
        msgtype: MsgType.Text,
        body: `* ${trimmed}`,
        "m.new_content": { msgtype: MsgType.Text, body: trimmed },
        "m.relates_to": { rel_type: RelationType.Replace, event_id: eventId },
      },
    );
    return response.event_id;
  }

  async redactMessage(roomId: string, eventId: string, reason?: string): Promise<void> {
    await this.requireClient().redactEvent(roomId, eventId, undefined, { reason });
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
    const room = this.requireRoom(roomId);
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
    client.on(ClientEvent.Sync, this.handleSync);
    client.on(ClientEvent.Room, this.handleRoom);
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
    client.off(ClientEvent.Sync, this.handleSync);
    client.off(ClientEvent.Room, this.handleRoom);
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
      this.hasPrepared = true;
      this.updateStatus({ state: "ready", error: null });
      this.emit("roomsChanged", this.getRooms());
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
    if (room.getMyMembership() === "join" && !room.isSpaceRoom()) {
      this.emit("roomUpdated", this.requireRoomMapper().map(room));
    }
    this.emit("roomsChanged", this.getRooms());
  };

  private handleRoomUpdate = (room: Room): void => this.emitRoomUpdate(room);

  private handleMembership = (room: Room): void => {
    this.emitRoomUpdate(room);
    this.emit("roomsChanged", this.getRooms());
  };

  private handleStateEvent = (
    _event: MatrixEvent,
    state: RoomState,
  ): void => {
    const room = this.client?.getRoom(state.roomId);
    if (room) this.emitRoomUpdate(room);
  };

  private handleTimeline = (
    event: MatrixEvent,
    room: Room | undefined,
    toStartOfTimeline: boolean | undefined,
    removed: boolean,
  ): void => {
    if (!room) return;
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
    const mapped = target ? this.mapMessage(target, room) : null;
    if (mapped) this.emit("messageUpdated", mapped);
    else if (targetId) {
      this.emit("messageRemoved", { roomId: room.roomId, eventId: targetId });
    }
  };

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
    if (room.getMyMembership() !== "join" || room.isSpaceRoom()) return;
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



