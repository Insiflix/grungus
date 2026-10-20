import { ClientEvent, RoomEvent, RoomStateEvent, MatrixEventEvent, MatrixError, UpdateDelayedEventAction, type MatrixClient, type MatrixEvent, type Room } from "matrix-js-sdk";
import { ClientWidgetApi, Widget, WidgetDriver, OpenIDRequestState, type SimpleObservable, type IOpenIDUpdate, type IRoomEvent, type Capability } from "matrix-widget-api";
import { allowedCallCapabilities, callEvents, callState, callToDevice, ownCallStateKeys, readableCallState, elementCallUrl, isConversationCall } from "./MatrixCallPolicy";
import { guardWidgetMessages } from "./WidgetMessageGuard";

const raw = (event: MatrixEvent) => event.getEffectiveEvent() as IRoomEvent;
export class MatrixCallDriver extends WidgetDriver {
  constructor(private client: MatrixClient, private roomId: string) { super(); }
  private writtenState = new Map<string, string>();
  async cleanup() {
    await Promise.allSettled([...this.writtenState].filter(([key]) => key !== this.client.getUserId()).map(([key, type]) => this.client.sendStateEvent(this.roomId, type as never, {} as never, key)));
    this.writtenState.clear();
  }
  private room(id?: string | null) { if (id && id !== this.roomId) throw new Error("Call access outside its room denied"); const room = this.client.getRoom(this.roomId); if (!room || room.getMyMembership() !== "join") throw new Error("Join this room before calling"); return room; }
  private validate(type: string, stateKey?: string | null, roomId?: string | null) {
    this.room(roomId);
    if (stateKey != null ? !callState.has(type) || !ownCallStateKeys(this.client.getUserId()!, this.client.getDeviceId()!).includes(stateKey) : !callEvents.has(type)) throw new Error("Unsupported call event");
  }
  override async validateCapabilities(requested: Set<Capability>) { return allowedCallCapabilities(requested, this.client.getUserId()!, this.client.getDeviceId()!, this.roomId); }
  override processError(error: unknown) { return error instanceof MatrixError ? { matrix_api_error: error.asWidgetApiErrorData() } : undefined; }
  override getKnownRooms() { return [this.roomId]; }
  override async sendEvent(type: string, content: unknown, stateKey?: string | null, roomId?: string | null) {
    this.validate(type, stateKey, roomId);
    const result = stateKey != null ? await this.client.sendStateEvent(this.roomId, type as Parameters<MatrixClient["sendStateEvent"]>[1], content as never, stateKey) : await this.client.sendEvent(this.roomId, type as never, content as never);
    if (stateKey != null && Object.keys(content as object).length) this.writtenState.set(stateKey, type);
    return { roomId: this.roomId, eventId: result.event_id };
  }
  override async sendStickyEvent(duration: number, type: string, content: unknown, roomId?: string | null) {
    this.validate(type, null, roomId);
    const result = await this.client._unstable_sendStickyEvent(this.roomId, duration, null, type as never, content as never);
    return { roomId: this.roomId, eventId: result.event_id };
  }
  override async sendDelayedEvent(delay: number, type: string, content: unknown, stateKey?: string | null, roomId?: string | null) {
    this.validate(type, stateKey, roomId);
    const result = stateKey != null ? await this.client._unstable_sendDelayedStateEvent(this.roomId, { delay }, type as never, content as never, stateKey) : await this.client._unstable_sendDelayedEvent(this.roomId, { delay }, null, type as never, content as never);
    this.delayed.add(result.delay_id);
    return { roomId: this.roomId, delayId: result.delay_id };
  }
  override async sendDelayedStickyEvent(delay: number, duration: number, type: string, content: unknown, roomId?: string | null) {
    this.validate(type, null, roomId);
    const result = await this.client._unstable_sendStickyDelayedEvent(this.roomId, duration, { delay }, null, type as never, content as never);
    this.delayed.add(result.delay_id);
    return { roomId: this.roomId, delayId: result.delay_id };
  }
  private delayed = new Set<string>();
  private async updateDelay(id: string, action: UpdateDelayedEventAction) { if (!this.delayed.has(id)) throw new Error("Unknown call delayed event"); await this.client._unstable_updateDelayedEvent(id, action); if (action !== UpdateDelayedEventAction.Restart) this.delayed.delete(id); }
  override cancelScheduledDelayedEvent(id: string) { return this.updateDelay(id, UpdateDelayedEventAction.Cancel); }
  override restartScheduledDelayedEvent(id: string) { return this.updateDelay(id, UpdateDelayedEventAction.Restart); }
  override sendScheduledDelayedEvent(id: string) { return this.updateDelay(id, UpdateDelayedEventAction.Send); }
  override async sendToDevice(type: string, encrypted: boolean, contentMap: { [userId: string]: { [deviceId: string]: object } }) {
    if (!callToDevice.has(type)) throw new Error("Unsupported call to-device event");
    if (type.endsWith(".encryption_keys") && !encrypted) throw new Error("Call encryption keys must be sent encrypted");
    const room = this.room();
    for (const [userId, devices] of Object.entries(contentMap)) {
      if (room.getMember(userId)?.membership !== "join") throw new Error("Call recipient is outside this room");
      for (const [deviceId, content] of Object.entries(devices)) {
        if (encrypted) await this.client.encryptAndSendToDevice(type, [{ userId, deviceId }], content);
        else await this.client.sendToDevice(type, new Map([[userId, new Map([[deviceId, content]])]]));
      }
    }
  }
  override async readRoomState(roomId: string, type: string, stateKey: string | undefined) {
    const room = this.room(roomId); if (!readableCallState.has(type)) throw new Error("Unsupported call state read");
    return room.currentState.getStateEvents(type).filter(event => stateKey === undefined || event.getStateKey() === stateKey).map(raw);
  }
  override async readStateEvents(type: string, key: string | undefined, limit: number, roomIds?: string[] | null) { for (const id of roomIds ?? []) this.room(id); const events = await this.readRoomState(this.roomId, type, key); return limit ? events.slice(0, limit) : events; }
  override async readRoomTimeline(roomId: string, type: string, msgtype: string | undefined, stateKey: string | undefined, limit: number, since?: string) {
    if (stateKey !== undefined || readableCallState.has(type)) return this.readRoomState(roomId, type, stateKey);
    if (!callEvents.has(type)) throw new Error("Unsupported call timeline read");
    let events = this.room(roomId).getLiveTimeline().getEvents();
    if (since) { const index = events.findIndex(event => event.getId() === since); events = index < 0 ? [] : events.slice(index + 1); }
    events = events.filter(event => event.getType() === type && (!msgtype || event.getContent().msgtype === msgtype));
    return (limit ? events.slice(-limit) : events).map(raw);
  }
  override async readRoomEvents(type: string, msgtype: string | undefined, limit: number, roomIds?: string[] | null, since?: string) { for (const id of roomIds ?? []) this.room(id); return this.readRoomTimeline(this.roomId, type, msgtype, undefined, limit, since); }
  override async readStickyEvents(roomId: string) { return [...this.room(roomId)._unstable_getStickyEvents()].filter(event => callEvents.has(event.getType())).map(raw); }
  override askOpenID(observer: SimpleObservable<IOpenIDUpdate>) { void this.client.getOpenIdToken().then(token => observer.update({ state: OpenIDRequestState.Allowed, token }), () => observer.update({ state: OpenIDRequestState.Blocked })); }
  override async getRtcTransports() { return { rtc_transports: await this.client._unstable_getRTCTransports() }; }
  override async downloadFile(uri: string) {
    const match = /^mxc:\/\/([^/]+)\/(.+)$/.exec(uri); if (!match) throw new Error("Invalid media URI");
    const file = await this.client.http.authedRequest<Blob>("GET" as never, `/media/download/${encodeURIComponent(match[1])}/${encodeURIComponent(match[2])}`, undefined, undefined, { prefix: "/_matrix/client/v1", rawResponseBody: true });
    return { file };
  }
}
export function mountMatrixCall(client: MatrixClient, iframe: HTMLIFrameElement, roomId: string, video: boolean, onClose: () => void, onReady?: () => void, onJoined?: () => void) {
  const widgetId = `grungus-call-${crypto.randomUUID()}`;
  const room = client.getRoom(roomId);
  const direct = isConversationCall(room, client.getRooms());
  const joining = Boolean(room && client.matrixRTC.getActiveRoomSession(room)?.memberships.length);
  const url = elementCallUrl(window.location.href, roomId, client.getUserId()!, client.getDeviceId()!, client.getHomeserverUrl(), video, widgetId, direct, joining);
  const driver = new MatrixCallDriver(client, roomId);
  const releaseGuard = guardWidgetMessages(iframe, widgetId, url);
  let api: ClientWidgetApi;
  try { api = new ClientWidgetApi(new Widget({ id: widgetId, creatorUserId: client.getUserId()!, type: "m.custom", url, waitForIframeLoad: false }), iframe, driver); }
  catch (error) { releaseGuard(); throw error; }
  api.setViewedRoomId(roomId);
  // Source + widget origin are enforced by the capture-phase guard above.
  api.transport.strictOriginCheck = false;
  api.on("ready", () => onReady?.());
  const safe = (promise: Promise<unknown>) => { void promise.catch(error => console.warn("Call widget event delivery failed", error)); };
  const timeline = (event: MatrixEvent, room?: Room) => { if (room?.roomId === roomId && callEvents.has(event.getType())) safe(api.feedEvent(raw(event))); };
  const state = (event: MatrixEvent) => { if (event.getRoomId() === roomId && readableCallState.has(event.getType())) safe(api.feedStateUpdate(raw(event))); };
  const device = (event: MatrixEvent) => { if (callToDevice.has(event.getType()) && client.getRoom(roomId)?.getMember(event.getSender()!)?.membership === "join") safe(api.feedToDevice({ sender: event.getSender()!, type: event.getType(), content: event.getContent() }, event.isEncrypted())); };
  const decrypted = (event: MatrixEvent) => { if (event.getRoomId()) timeline(event, client.getRoom(event.getRoomId()!) ?? undefined); else device(event); };
  client.on(RoomEvent.Timeline, timeline); client.on(RoomStateEvent.Events, state); client.on(ClientEvent.ToDeviceEvent, device); client.on(MatrixEventEvent.Decrypted, decrypted);
  api.on("action:im.vector.hangup", event => { event.preventDefault(); api.transport.reply(event.detail, {}); onClose(); });
  api.on("action:io.element.close", event => { event.preventDefault(); api.transport.reply(event.detail, {}); onClose(); });
  api.on("action:io.element.join", event => { event.preventDefault(); api.transport.reply(event.detail, {}); onJoined?.(); });
  for (const action of ["io.element.device_mute", "set_always_on_screen"]) api.on(`action:${action}`, event => { event.preventDefault(); api.transport.reply(event.detail, {}); });
  iframe.src = url;
  const dispose = () => { api.stop(); releaseGuard(); void driver.cleanup(); client.off(RoomEvent.Timeline, timeline); client.off(RoomStateEvent.Events, state); client.off(ClientEvent.ToDeviceEvent, device); client.off(MatrixEventEvent.Decrypted, decrypted); };
  const hangup = async () => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { await Promise.race([api.transport.send("im.vector.hangup", {}), new Promise(resolve => { timer = setTimeout(resolve, 2500); })]); } catch {} finally { clearTimeout(timer); onClose(); }
  };
  return { dispose, hangup };
}
