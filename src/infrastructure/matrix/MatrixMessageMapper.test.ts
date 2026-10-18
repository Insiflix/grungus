import { describe, expect, it } from "vitest";
import {
  createClient,
  MatrixEvent,
  Room,
  type IEvent,
} from "matrix-js-sdk";
import { MatrixMessageMapper } from "./MatrixMessageMapper";

const client = createClient({
  baseUrl: "https://matrix.example",
  userId: "@me:example",
});
const room = new Room("!room:example", client, "@me:example");
const mapper = new MatrixMessageMapper(client);

function messageEvent(msgtype: string, body: string): MatrixEvent {
  return new MatrixEvent({
    event_id: `$${msgtype}`,
    room_id: room.roomId,
    sender: "@alice:example",
    origin_server_ts: 1_700_000_000_000,
    type: "m.room.message",
    content: { msgtype, body },
  } as unknown as IEvent);
}

describe("MatrixMessageMapper", () => {
  it.each([
    ["m.text", "text"],
    ["m.notice", "notice"],
    ["m.emote", "emote"],
    ["com.example.custom", "unsupported"],
  ] as const)("maps %s without leaking SDK event types", (msgtype, expected) => {
    const result = mapper.map(messageEvent(msgtype, "Hello Matrix"), room);

    expect(result).toMatchObject({
      id: `$${msgtype}`,
      roomId: "!room:example",
      type: expected,
      body: "Hello Matrix",
      sender: { id: "@alice:example" },
      sendState: "sent",
    });
  });

  it("maps reply metadata into the domain model", () => {
    const event = messageEvent("m.text", "A reply");
    event.event.content!["m.relates_to"] = {
      "m.in_reply_to": { event_id: "$original" },
    };

    expect(mapper.map(event, room)?.replyTo).toBe("$original");
  });

  it("represents unknown timeline events gracefully", () => {
    const event = new MatrixEvent({
      event_id: "$poll",
      room_id: room.roomId,
      sender: "@alice:example",
      origin_server_ts: 1,
      type: "org.matrix.msc3381.poll.start",
      content: {},
    } as unknown as IEvent);

    expect(mapper.map(event, room)).toMatchObject({
      type: "unsupported",
      body: "Unsupported event · org.matrix.msc3381.poll.start",
    });
  });
});

it.each(["m.call.invite", "m.call.candidates", "m.call.negotiate", "m.call.hangup", "io.element.call.encryption_keys", "org.matrix.msc3401.call.member", "org.matrix.msc4075.rtc.notification"])("keeps %s signalling out of the chat timeline", type => {
 const event = new MatrixEvent({ event_id: "$signal", room_id: room.roomId, sender: "@alice:example", type, content: {}, origin_server_ts: 1 });
 expect(mapper.map(event, room)).toBeNull();
});
