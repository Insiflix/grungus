import { describe, expect, it, vi } from "vitest";
import { Direction, EventStatus, EventType, MatrixEvent, type MatrixClient, type Room } from "matrix-js-sdk";
import { collectTimelineEvents, loadLatestRoomEvents, oldestLoadedTimeline } from "./MatrixTimelineLoader";

const event = (id: string, timestamp: number) => new MatrixEvent({ event_id: id, type: EventType.RoomMessageEncrypted, room_id: "!room:example", content: {}, origin_server_ts: timestamp });
function setup() {
  const oldEvent = event("$old", 1), newestEvent = event("$new", 3);
  const old = { getEvents: () => [oldEvent] };
  const latest = { getEvents: () => [oldEvent, newestEvent], setPaginationToken: vi.fn() };
  const timelineSet = { setLiveTimeline: vi.fn(), addEventsToTimeline: vi.fn() };
  const room = { roomId: "!room:example", getLiveTimeline: () => old, getUnfilteredTimelineSet: () => timelineSet } as unknown as Room;
  const client = { createMessagesRequest: vi.fn(async (): Promise<{ chunk: { event_id: string }[]; end?: string }> => ({ chunk: [{ event_id: "$new" }] })), getEventTimeline: vi.fn(async () => latest), getEventMapper: () => (raw: { event_id?: string }) => raw.event_id === "$new" ? newestEvent : oldEvent, decryptEventIfNeeded: vi.fn(async () => undefined) };
  return { client, room, old, latest, timelineSet, oldEvent, newestEvent };
}
describe("latest room history", () => {
  it("loads past a page full of call events to include an older actual message", async () => {
    const { client, room, old, latest } = setup();
    old.getEvents = () => []; latest.getEvents = () => [];
    const message = new MatrixEvent({ event_id: "$hui", type: EventType.RoomMessage, content: { msgtype: "m.text", body: "hui" }, origin_server_ts: 1 });
    const signal = new MatrixEvent({ event_id: "$signal", type: "m.call.encryption_keys", content: {}, origin_server_ts: 2 });
    client.getEventMapper = () => raw => raw.event_id === "$hui" ? message : signal;
    client.createMessagesRequest.mockResolvedValueOnce({ chunk: [{ event_id: "$signal" }], end: "older" }).mockResolvedValueOnce({ chunk: [{ event_id: "$hui" }] });
    const events = await loadLatestRoomEvents(client as unknown as MatrixClient, room);
    expect(events).toContain(message);
    expect(client.createMessagesRequest).toHaveBeenNthCalledWith(2, room.roomId, "older", 40, Direction.Backward);
  });

  it("promotes the newest timeline before adding history so the SDK can link the old live window", async () => {
    const { client, room, timelineSet } = setup();
    timelineSet.addEventsToTimeline.mockImplementation(() => { expect(timelineSet.setLiveTimeline).toHaveBeenCalledOnce(); });
    await loadLatestRoomEvents(client as unknown as MatrixClient, room);
  });
  it("retains connected older history and paginates from its oldest loaded boundary", () => {
    const oldEvent = event("$old", 1), newestEvent = event("$new", 3);
    const older = { getEvents: () => [oldEvent], getNeighbouringTimeline: () => null };
    const latest = { getEvents: () => [newestEvent], getNeighbouringTimeline: () => older };
    expect(collectTimelineEvents(latest as never)).toEqual([oldEvent, newestEvent]);
    expect(oldestLoadedTimeline(latest as never)).toBe(older);
  });
  it("fetches the newest event, promotes its timeline, and decrypts old and new events", async () => {
    const { client, room, latest, timelineSet, oldEvent, newestEvent } = setup();
    expect(await loadLatestRoomEvents(client as unknown as MatrixClient, room)).toEqual([oldEvent, newestEvent]);
    expect(client.createMessagesRequest).toHaveBeenCalledWith(room.roomId, null, 40, Direction.Backward);
    expect(client.getEventTimeline).toHaveBeenCalledWith(timelineSet, "$new");
    expect(timelineSet.setLiveTimeline).toHaveBeenCalledWith(latest);
    expect(latest.setPaginationToken).toHaveBeenCalledWith(null, Direction.Forward);
    expect(timelineSet.addEventsToTimeline).toHaveBeenCalledWith([newestEvent], true, false, latest, undefined);
    expect(client.decryptEventIfNeeded).toHaveBeenCalledTimes(2);
  });
  it("does not replace a live timeline with pending outgoing messages", async () => {
    const { client, room, oldEvent, timelineSet, newestEvent } = setup();
    oldEvent.status = EventStatus.SENDING;
    expect(await loadLatestRoomEvents(client as unknown as MatrixClient, room)).toEqual([oldEvent, newestEvent]);
    expect(timelineSet.setLiveTimeline).not.toHaveBeenCalled();
  });
  it("keeps newer sync events that arrive during the history request", async () => {
    const { client, room, timelineSet, oldEvent, newestEvent } = setup();
    const liveEvent = event("$live", 4);
    client.createMessagesRequest.mockImplementationOnce(async () => {
      room.getLiveTimeline = () => ({ getEvents: () => [oldEvent, liveEvent] }) as never;
      return { chunk: [{ event_id: "$new" }] };
    });
    expect(await loadLatestRoomEvents(client as unknown as MatrixClient, room)).toEqual([oldEvent, newestEvent, liveEvent]);
    expect(timelineSet.setLiveTimeline).not.toHaveBeenCalled();
  });
  it("allows empty conversations and keeps individual decryption failures visible", async () => {
    const { client, room, oldEvent } = setup();
    client.createMessagesRequest.mockResolvedValueOnce({ chunk: [] });
    client.decryptEventIfNeeded.mockRejectedValueOnce(new Error("Missing key"));
    expect(await loadLatestRoomEvents(client as unknown as MatrixClient, room)).toEqual([oldEvent]);
    expect(client.getEventTimeline).not.toHaveBeenCalled();
  });
});
