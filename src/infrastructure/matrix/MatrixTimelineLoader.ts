import { Direction, type EventTimeline, type MatrixClient, type MatrixEvent, type Room } from "matrix-js-sdk";
import { isHiddenTimelineEvent } from "./MatrixTimelinePolicy";

/** Include already loaded history connected to the live timeline after a gap is bridged. */
export function collectTimelineEvents(timeline: EventTimeline): MatrixEvent[] {
  const visited = new Set<EventTimeline>();
  const events = new Map<string | undefined, MatrixEvent>();
  let current: EventTimeline | null = timeline;
  while (current && !visited.has(current)) {
    visited.add(current);
    for (const event of current.getEvents()) if (!events.has(event.getId())) events.set(event.getId(), event);
    current = current.getNeighbouringTimeline?.(Direction.Backward) ?? null;
  }
  return [...events.values()].sort((left, right) => left.getTs() - right.getTs());
}

export function oldestLoadedTimeline(timeline: EventTimeline): EventTimeline {
  const visited = new Set<EventTimeline>();
  let current = timeline;
  while (!visited.has(current)) {
    visited.add(current);
    const previous = current.getNeighbouringTimeline?.(Direction.Backward);
    if (!previous || visited.has(previous)) break;
    current = previous;
  }
  return current;
}

/** Fetch the server's current timeline head rather than trusting an old sync window. */
export async function loadLatestRoomEvents(client: MatrixClient, room: Room): Promise<MatrixEvent[]> {
  const original = room.getLiveTimeline();
  const originalEvents = collectTimelineEvents(original);
  const originalTail = original.getEvents().at(-1)?.getId();
  let page = await client.createMessagesRequest(room.roomId, null, 40, Direction.Backward);
  const newestId = page.chunk[0]?.event_id;
  const timelineSet = room.getUnfilteredTimelineSet();
  const latest = newestId ? await client.getEventTimeline(timelineSet, newestId) : null;
  const current = room.getLiveTimeline();
  const currentEvents = current.getEvents();

  // Keep a newer /sync timeline and preserve any unsent local echoes.
  if (latest && latest !== current && current === original &&
      currentEvents.at(-1)?.getId() === originalTail && !currentEvents.some(event => event.status != null)) {
    latest.setPaginationToken(null, Direction.Forward);
    timelineSet.setLiveTimeline(latest);
  }

  const mapper = client.getEventMapper();
  const recentEvents = new Map<string | undefined, MatrixEvent>();
  const attempted = new Set<MatrixEvent>();
  const decrypt = async (events: MatrixEvent[]) => {
    const pending = events.filter(event => !attempted.has(event));
    pending.forEach(event => attempted.add(event));
    await Promise.allSettled(pending.map(event => client.decryptEventIfNeeded(event)));
  };
  const tokens = new Set<string>();
  // Protocol traffic can fill entire server pages. Fetch a useful window of
  // visible messages, bounded to avoid scanning an unlimited room history.
  for (let pageIndex = 0; pageIndex < 10; pageIndex++) {
    const mapped = page.chunk.map(event => mapper({ ...event, room_id: room.roomId }));
    await decrypt(mapped);
    mapped.forEach(event => recentEvents.set(event.getId(), event));
    if (latest) timelineSet.addEventsToTimeline(mapped, true, false, oldestLoadedTimeline(latest), page.end);
    if ([...recentEvents.values()].filter(event => !isHiddenTimelineEvent(event)).length >= 20 ||
        !page.end || mapped.length === 0 || tokens.has(page.end) || pageIndex === 9) break;
    tokens.add(page.end);
    page = await client.createMessagesRequest(room.roomId, page.end, 40, Direction.Backward);
  }

  const events = [...new Map([...originalEvents, ...collectTimelineEvents(current), ...recentEvents.values(), ...(latest ? collectTimelineEvents(latest) : [])].map(event => [event.getId(), event])).values()];
  await decrypt(events);
  return events.sort((left, right) => left.getTs() - right.getTs());
}
