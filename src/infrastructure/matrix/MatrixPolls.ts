import type { TimelineEvents } from "matrix-js-sdk";
﻿import { EventStatus, MatrixEventEvent, RoomEvent, M_POLL_START, M_POLL_RESPONSE, M_POLL_END, M_POLL_KIND_DISCLOSED, type MatrixClient, type MatrixEvent, type Room } from "matrix-js-sdk";
import { PollStartEvent } from "matrix-js-sdk/lib/extensible_events_v1/PollStartEvent.js";
import { PollResponseEvent } from "matrix-js-sdk/lib/extensible_events_v1/PollResponseEvent.js";
import { PollEndEvent } from "matrix-js-sdk/lib/extensible_events_v1/PollEndEvent.js";
import { collectTimelineEvents } from "./MatrixTimelineLoader";
import { pollResults, validatePollInput, type PollDefinition, type PollInput, type PollSnapshot, type PollVote } from "../../domain/messaging/Polls";

export function parsePoll(event: MatrixEvent): PollDefinition | undefined {
  if (!M_POLL_START.matches(event.getType()) || event.isRedacted()) return;
  try {
    const poll = new PollStartEvent({ type: event.getType(), content: event.getContent() });
    if (new Set(poll.answers.map(answer => answer.id)).size !== poll.answers.length) return;
    return { question: poll.question.text, answers: poll.answers.map(answer => ({ id: answer.id, text: answer.text })), maxSelections: Math.min(Math.max(1, Math.floor(poll.maxSelections)), poll.answers.length), disclosed: M_POLL_KIND_DISCLOSED.matches(poll.rawKind) };
  } catch { return; }
}
export function createPollEvent(input: PollInput) {
  const valid = validatePollInput(input);
  return PollStartEvent.from(valid.question, valid.answers, valid.disclosed ? "org.matrix.msc3381.poll.disclosed" : "org.matrix.msc3381.poll.undisclosed", valid.maxSelections).serialize();
}
function relevant(event: MatrixEvent, id: string): boolean {
  return event.getRelation()?.event_id === id && event.getRelation()?.rel_type === "m.reference";
}
function canClose(client: MatrixClient, room: Room, root: MatrixEvent, userId = client.getUserId() ?? ""): boolean {
  return root.getSender() === userId || room.currentState.maySendRedactionForEvent(root, userId);
}
export function calculatePoll(client: MatrixClient, room: Room, root: MatrixEvent, events: MatrixEvent[], loading = false, error?: string): PollSnapshot {
  const definition = parsePoll(root);
  if (!definition) throw new Error("This poll is no longer available.");
  let endTimestamp = Infinity;
  let incomplete = false;
  const votes: PollVote[] = [];
  for (const event of events) {
    if (event.isRedacted() || event.status === EventStatus.NOT_SENT || event.status === EventStatus.CANCELLED) continue;
    if (!relevant(event, root.getId()!)) continue;
    if (event.isDecryptionFailure()) { incomplete = true; continue; }
    if (M_POLL_END.matches(event.getType()) && event.getSender() && canClose(client, room, root, event.getSender()!)) endTimestamp = Math.min(endTimestamp, event.getTs());
    if (M_POLL_RESPONSE.matches(event.getType()) && event.getSender()) {
      let answers: string[] = [];
      try { answers = new PollResponseEvent({ type: event.getType(), content: event.getContent() }).answerIds; } catch { /* A malformed latest response spoils the previous vote. */ }
      votes.push({ id: event.getId() ?? event.getTxnId() ?? "", sender: event.getSender()!, timestamp: event.getTs(), answers });
    }
  }
  return { ...pollResults(definition, votes, client.getUserId() ?? "", endTimestamp), ended: endTimestamp !== Infinity, canEnd: canClose(client, room, root), loading, incomplete, error };
}
async function fetchRelations(client: MatrixClient, roomId: string, id: string, receive: (events: MatrixEvent[]) => void, active: () => boolean) {
  let from: string | undefined;
  const seen = new Set<string>();
  do {
    const page = await client.relations(roomId, id, "m.reference", undefined, { from });
    if (!active()) return;
    await Promise.allSettled(page.events.map(event => client.decryptEventIfNeeded(event)));
    if (!active()) return;
    receive(page.events);
    from = page.nextBatch ?? undefined;
    if (from && seen.has(from)) throw new Error("Could not load all poll responses. Retry to refresh the results.");
    if (from) seen.add(from);
  } while (from && active());
}
export function observeMatrixPoll(client: MatrixClient, room: Room, id: string, listener: (snapshot: PollSnapshot) => void): () => void {
  const root = room.findEventById(id);
  if (!root || !parsePoll(root)) throw new Error("This poll is not available. Reopen the conversation to refresh it.");
  let active = true, loading = true;
  let error: string | undefined;
  const events = new Map<string, MatrixEvent>();
  const fetchedUndecryptableIds = new Set<string>();
  const add = (event: MatrixEvent) => { const key = event.getId() ?? event.getTxnId(); if (key && event.getRoomId() === room.roomId) events.set(key, event); };
  collectTimelineEvents(room.getLiveTimeline()).forEach(add);
  const publish = () => {
    if (!active) return;
    try {
      const snapshot = calculatePoll(client, room, root, [...events.values()], loading, error);
      listener({ ...snapshot, incomplete: snapshot.incomplete || [...fetchedUndecryptableIds].some(id => events.get(id)?.isDecryptionFailure()) });
    }
    catch (cause) { listener({ counts: {}, ownAnswers: [], totalVoters: 0, ended: true, canEnd: false, loading: false, incomplete: true, error: cause instanceof Error ? cause.message : "Poll unavailable." }); }
  };
  const changed = (event: MatrixEvent) => {
    if (event.getRoomId() !== room.roomId) return;
    const target = event.getAssociatedId();
    if (event.getId() !== id && !relevant(event, id) && !(target && events.has(target))) return;
    add(event); publish();
  };
  client.on(RoomEvent.Timeline, changed);
  client.on(RoomEvent.LocalEchoUpdated, changed);
  client.on(MatrixEventEvent.Decrypted, changed);
  client.on(RoomEvent.Redaction, changed);
  publish();
  void fetchRelations(client, room.roomId, id, incoming => { incoming.forEach(event => { add(event); if (event.isDecryptionFailure() && event.getId()) fetchedUndecryptableIds.add(event.getId()!); }); publish(); }, () => active)
    .catch(cause => { error = cause instanceof Error ? cause.message : "Could not load poll responses."; })
    .finally(() => { loading = false; publish(); });
  return () => { active = false; client.off(RoomEvent.Timeline, changed); client.off(RoomEvent.LocalEchoUpdated, changed); client.off(MatrixEventEvent.Decrypted, changed); client.off(RoomEvent.Redaction, changed); };
}
export async function sendPollVote(client: MatrixClient, room: Room, id: string, answers: string[], assertCurrent: () => void = () => {}) {
  const root = room.findEventById(id);
  const poll = root && parsePoll(root);
  if (!root || !poll) throw new Error("This poll is not available.");
  const events: MatrixEvent[] = collectTimelineEvents(room.getLiveTimeline());
  await fetchRelations(client, room.roomId, id, incoming => events.push(...incoming), () => true);
  assertCurrent();
  if (calculatePoll(client, room, root, events).ended) throw new Error("This poll has ended.");
  if (answers.length > poll.maxSelections || new Set(answers).size !== answers.length || answers.some(answer => !poll.answers.some(option => option.id === answer))) throw new Error("Choose valid poll answers.");
  const event = PollResponseEvent.from(answers, id).serialize();
  await client.sendEvent(room.roomId, event.type as keyof TimelineEvents, event.content as TimelineEvents[keyof TimelineEvents]);
}
export async function closeMatrixPoll(client: MatrixClient, room: Room, id: string) {
  const root = room.findEventById(id);
  if (!root || !canClose(client, room, root)) throw new Error("You do not have permission to end this poll.");
  const event = PollEndEvent.from(id, "Poll ended").serialize();
  await client.sendEvent(room.roomId, event.type as keyof TimelineEvents, event.content as TimelineEvents[keyof TimelineEvents]);
}
