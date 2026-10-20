import { describe, expect, it, vi } from "vitest";
import { MatrixEvent, EventType, type MatrixClient, type Room } from "matrix-js-sdk";
import { searchMatrixMessages } from "./MatrixMessageSearch";
import { matchesMessage, type MessageSearchQuery } from "../../domain/messaging/MessageSearch";
import type { MatrixMessage } from "../../domain/matrix/MatrixTypes";
const message = (patch: Partial<MatrixMessage> = {}): MatrixMessage => ({ id: "$one", roomId: "!one", sender: { id: "@alice:test", displayName: "Alice", avatarUrl: null }, timestamp: 100, type: "text", body: "Project launch", edited: false, replyTo: null, reactions: [], sendState: "sent", isOwn: false, isRedacted: false, ...patch });
describe("message search", () => {
  it("combines scope, sender, inclusive start/exclusive end dates and media filters", () => {
    const query: MessageSearchQuery = { roomIds: ["!one"], text: "launch project", sender: "@alice:test", after: 100, before: 200, media: "image" };
    const image = message({ type: "image" });
    expect(matchesMessage(image, query)).toBe(true);
    for (const patch of [{ roomId: "!other" }, { timestamp: 200 }, { timestamp: 99 }, { type: "text" as const }, { isRedacted: true }, { sender: { id: "@bob:test", displayName: "Alice", avatarUrl: null } }]) expect(matchesMessage({ ...image, ...patch }, query)).toBe(false);
    expect(matchesMessage(message({ body: "https://example.test/demo" }), { roomIds: ["!one"], text: "", media: "link" })).toBe(true);
  });
  it("paginates every selected room and decrypts before matching without sending search terms to the server", async () => {
    const decrypted = new Set<string>();
    const raw = (id: string, body: string) => ({ event_id: id, type: EventType.RoomMessage, origin_server_ts: 100, sender: "@alice:test", content: { msgtype: "m.text", body } });
    const request = vi.fn(async (roomId: string, token: string | null, _limit: number, _direction: unknown) => roomId === "!one" && !token ? { chunk: [raw("$one", "Project launch")], end: "older" } : { chunk: [raw(`${roomId}-older`, "Launch details")], end: undefined });
    const client = { getRoom: (id: string) => ({ roomId: id, getMyMembership: () => "join", isSpaceRoom: () => false }), createMessagesRequest: request, getEventMapper: () => (raw: object) => new MatrixEvent(raw), decryptEventIfNeeded: vi.fn(async (event: MatrixEvent) => { decrypted.add(event.getId()!); }) } as unknown as MatrixClient;
    const map = (event: MatrixEvent, room: Room) => { expect(decrypted.has(event.getId()!)).toBe(true); return message({ id: event.getId()!, roomId: room.roomId, body: event.getContent().body }); };
    const result = await searchMatrixMessages(client, { roomIds: ["!one", "!two"], text: "launch" }, map);
    expect(result.messages).toHaveLength(3); expect(result.roomsDone).toBe(2);
    expect(request).toHaveBeenCalledTimes(3);
    expect(request.mock.calls[0].length).toBe(4);
  });
  it("stops pagination after cancellation and rejects non-joined rooms", async () => {
    const controller = new AbortController();
    const client = { getRoom: () => ({ getMyMembership: () => "join", isSpaceRoom: () => false }), createMessagesRequest: vi.fn(async () => { controller.abort(); return { chunk: [], end: "next" }; }) } as unknown as MatrixClient;
    await expect(searchMatrixMessages(client, { roomIds: ["!one"], text: "word" }, () => null, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    const forbidden = { getRoom: () => ({ getMyMembership: () => "leave" }) } as unknown as MatrixClient;
    await expect(searchMatrixMessages(forbidden, { roomIds: ["!one"], text: "word" }, () => null)).rejects.toThrow("joined");
  });
});
