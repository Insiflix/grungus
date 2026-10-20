import { Direction, type MatrixClient, type MatrixEvent, type Room } from "matrix-js-sdk";
import type { MatrixMessage } from "../../domain/matrix/MatrixTypes";
import { matchesMessage, type MessageSearchQuery, type MessageSearchResults } from "../../domain/messaging/MessageSearch";

/** Scan accessible history on-device so encrypted message contents never become server search terms. */
export async function searchMatrixMessages(client: MatrixClient, query: MessageSearchQuery, map: (event: MatrixEvent, room: Room) => MatrixMessage | null, signal?: AbortSignal, onProgress?: (result: MessageSearchResults) => void): Promise<MessageSearchResults> {
  const roomIds = [...new Set(query.roomIds)];
  const result: MessageSearchResults = { messages: [], scanned: 0, roomsDone: 0, totalRooms: roomIds.length, undecryptable: 0, limited: false };
  const seen = new Set<string>();
  const publish = () => { result.messages.sort((a, b) => b.timestamp - a.timestamp); onProgress?.({ ...result, messages: [...result.messages] }); };
  for (const roomId of roomIds) {
    signal?.throwIfAborted();
    const room = client.getRoom(roomId);
    if (!room || room.getMyMembership() !== "join" || room.isSpaceRoom()) throw new Error("Search is limited to joined message rooms.");
    let token: string | null = null;
    const tokens = new Set<string>();
    const edits = new Map<string, MatrixEvent>();
    while (true) {
      signal?.throwIfAborted();
      const page = await client.createMessagesRequest(roomId, token, 100, Direction.Backward);
      signal?.throwIfAborted();
      const events = page.chunk.map(raw => client.getEventMapper()({ ...raw, room_id: roomId }));
      await Promise.allSettled(events.map(event => client.decryptEventIfNeeded(event)));
      signal?.throwIfAborted();
      for (const event of events) {
        const id = event.getId();
        if (!id || seen.has(`${roomId}:${id}`)) continue;
        seen.add(`${roomId}:${id}`); result.scanned++;
        const relation = event.getRelation();
        if (relation?.rel_type === "m.replace" && relation.event_id && !event.isRedacted()) { if (!edits.has(relation.event_id)) edits.set(relation.event_id, event); continue; }
        const edit = edits.get(id);
        if (edit?.getSender() === event.getSender()) event.makeReplaced(edit);
        const message = map(event, room);
        if (message?.type === "encrypted") result.undecryptable++;
        if (message && matchesMessage(message, query)) result.messages.push(message);
        if (result.messages.length >= 500) { result.limited = true; publish(); return result; }
      }
      publish();
      if (!page.chunk.length || !page.end || tokens.has(page.end) || (query.after !== undefined && events.every(event => event.getTs() < query.after!))) break;
      token = page.end; tokens.add(token);
    }
    result.roomsDone++; publish();
  }
  return result;
}
