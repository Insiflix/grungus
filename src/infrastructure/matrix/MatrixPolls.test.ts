import { expect, it, vi } from "vitest";
import { createClient, MatrixEvent, Room, RoomEvent, EventType, M_POLL_START } from "matrix-js-sdk";
import type { PollSnapshot } from "../../domain/messaging/Polls";
import { calculatePoll, closeMatrixPoll, createPollEvent, observeMatrixPoll, parsePoll, sendPollVote } from "./MatrixPolls";
import { MatrixMessageMapper } from "./MatrixMessageMapper";
import { isHiddenTimelineEvent } from "./MatrixTimelinePolicy";
function setup() {
  const client = createClient({ baseUrl: "https://matrix.example", userId: "@me:example" });
  const room = new Room("!room:example", client, "@me:example");
  const serialized = createPollEvent({ question: "Lunch?", answers: ["Pizza", "Pasta"], maxSelections: 1, disclosed: true });
  const root = new MatrixEvent({ event_id: "$poll", room_id: room.roomId, sender: "@me:example", origin_server_ts: 1, type: serialized.type, content: serialized.content });
  vi.spyOn(room, "findEventById").mockImplementation(id => id === "$poll" ? root : undefined);
  room.getLiveTimeline().getEvents().push(root);
  vi.spyOn(client, "decryptEventIfNeeded").mockResolvedValue(undefined);
  vi.spyOn(client, "sendEvent").mockResolvedValue({ event_id: "$sent" });
  const relations = vi.spyOn(client, "relations").mockResolvedValue({ originalEvent: root, events: [] });
  const definition = parsePoll(root)!;
  const vote = (id: string, sender: string, answer: string[], timestamp: number, stable = false) => new MatrixEvent({ event_id: id, room_id: room.roomId, sender, origin_server_ts: timestamp, type: stable ? "m.poll.response" : "org.matrix.msc3381.poll.response", content: { "m.relates_to": { rel_type: "m.reference", event_id: "$poll" }, [stable ? "m.poll.response" : "org.matrix.msc3381.poll.response"]: { answers: answer } } });
  const end = (sender: string, timestamp: number) => new MatrixEvent({ event_id: "$end" + timestamp, room_id: room.roomId, sender, origin_server_ts: timestamp, type: "m.poll.end", content: { "m.relates_to": { rel_type: "m.reference", event_id: "$poll" }, "m.poll.end": {}, "m.text": "Ended" } });
  return { client, room, root, definition, vote, end, relations };
}
it("creates interoperable poll content and renders stable and unstable starts", () => {
  const { client, room, root, definition } = setup();
  expect(M_POLL_START.matches(root.getType())).toBe(true);
  expect(definition).toMatchObject({ question: "Lunch?", answers: [{ text: "Pizza" }, { text: "Pasta" }] });
  expect(new MatrixMessageMapper(client).map(root, room)).toMatchObject({ type: "poll", body: "Lunch?", poll: definition });
  const stable = new MatrixEvent({ ...root.event, type: "m.poll.start", content: { "m.poll.start": { question: { "m.text": "Stable?" }, kind: "m.poll.disclosed", max_selections: 2, answers: [{ id: "a", "m.text": "A" }, { id: "b", "m.text": "B" }] } } });
  expect(parsePoll(stable)).toMatchObject({ question: "Stable?", maxSelections: 2, disclosed: true });
});
it("keeps responses and end events out of the message timeline, authorizes closure, and excludes late votes", () => {
  const { client, room, root, vote, end, definition } = setup();
  const response = vote("$v", "@me:example", [definition.answers[0].id], 2, true);
  expect(isHiddenTimelineEvent(response)).toBe(true); expect(isHiddenTimelineEvent(end("@me:example", 3))).toBe(true);
  expect(calculatePoll(client, room, root, [response, end("@attacker:example", 3)])).toMatchObject({ ended: false, totalVoters: 1 });
  expect(calculatePoll(client, room, root, [response, end("@me:example", 3), vote("$late", "@other:example", [definition.answers[1].id], 4)])).toMatchObject({ ended: true, totalVoters: 1 });
});
it("loads all response pages and updates live votes, then removes subscriptions", async () => {
  const { client, room, vote, relations, root, definition } = setup();
  relations.mockResolvedValueOnce({ originalEvent: root, events: [vote("$v1", "@me:example", [definition.answers[0].id], 2)], nextBatch: "page2" }).mockResolvedValueOnce({ originalEvent: root, events: [vote("$v2", "@other:example", [definition.answers[1].id], 3)] });
  let snapshot: PollSnapshot | undefined;
  const callback = vi.fn((value: PollSnapshot) => { snapshot = value; });
  const stop = observeMatrixPoll(client, room, "$poll", callback);
  await vi.waitFor(() => expect(snapshot).toMatchObject({ loading: false, totalVoters: 2 }));
  expect(relations).toHaveBeenLastCalledWith(room.roomId, "$poll", "m.reference", undefined, { from: "page2" });
  client.emit(RoomEvent.LocalEchoUpdated, vote("$v3", "@me:example", [definition.answers[1].id], 4), room);
  expect(snapshot?.counts).toEqual({ [definition.answers[0].id]: 0, [definition.answers[1].id]: 2 });
  stop(); const calls = callback.mock.calls.length;
  client.emit(RoomEvent.LocalEchoUpdated, vote("$v4", "@another:example", [definition.answers[1].id], 5), room);
  expect(callback).toHaveBeenCalledTimes(calls);
});
it("sends votes through the SDK, rejects invalid choices and closed polls, and allows withdrawal", async () => {
  const { client, room, definition, end, relations, root } = setup();
  await sendPollVote(client, room, "$poll", [definition.answers[0].id]);
  expect(client.sendEvent).toHaveBeenCalledWith(room.roomId, "org.matrix.msc3381.poll.response", expect.objectContaining({ "m.relates_to": { rel_type: "m.reference", event_id: "$poll" } }));
  await sendPollVote(client, room, "$poll", []);
  await expect(sendPollVote(client, room, "$poll", ["invalid"])).rejects.toThrow("valid");
  relations.mockResolvedValueOnce({ originalEvent: root, events: [end("@me:example", 5)] });
  await expect(sendPollVote(client, room, "$poll", [definition.answers[0].id])).rejects.toThrow("ended");
  await closeMatrixPoll(client, room, "$poll"); expect(client.sendEvent).toHaveBeenLastCalledWith(room.roomId, "org.matrix.msc3381.poll.end", expect.any(Object));
});
it("reports response fetch failures instead of presenting partial results as complete", async () => {
  const { client, room, relations } = setup(); relations.mockRejectedValue(new Error("Offline"));
  let snapshot: PollSnapshot | undefined;
  const stop = observeMatrixPoll(client, room, "$poll", value => { snapshot = value; });
  await vi.waitFor(() => expect(snapshot).toMatchObject({ loading: false, error: "Offline" })); stop();
});

it("marks undecryptable response history as incomplete even when its relation is encrypted", async () => {
  const { client, room, relations, root } = setup();
  const encrypted = new MatrixEvent({ event_id: "$encrypted-vote", room_id: room.roomId, type: EventType.RoomMessageEncrypted, content: {} });
  vi.spyOn(encrypted, "isDecryptionFailure").mockReturnValue(true);
  relations.mockResolvedValue({ originalEvent: root, events: [encrypted] });
  let snapshot: PollSnapshot | undefined;
  const stop = observeMatrixPoll(client, room, "$poll", value => { snapshot = value; });
  await vi.waitFor(() => expect(snapshot).toMatchObject({ loading: false, incomplete: true })); stop();
});
it("does not send a vote if the account changes while responses are loading", async () => {
  const { client, room, definition } = setup();
  await expect(sendPollVote(client, room, "$poll", [definition.answers[0].id], () => { throw new Error("Session changed"); })).rejects.toThrow("Session changed");
  expect(client.sendEvent).not.toHaveBeenCalled();
});
