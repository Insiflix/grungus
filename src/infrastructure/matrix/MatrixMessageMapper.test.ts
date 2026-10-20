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
  it("maps uploaded images and encrypted file descriptors into downloadable attachments", () => {
    const image = messageEvent("m.image", "photo.png");
    Object.assign(image.event.content!, { url: "mxc://example.org/photo", info: { mimetype: "image/png", size: 42, w: 800, h: 600 } });
    expect(mapper.map(image, room)?.attachment).toMatchObject({ url: "mxc://example.org/photo", name: "photo.png", mimeType: "image/png", size: 42, width: 800, height: 600 });
    const file = messageEvent("m.file", "notes.txt");
    const descriptor = { url: "mxc://example.org/encrypted", v: "v2", iv: "iv", key: {}, hashes: {} };
    Object.assign(file.event.content!, { file: descriptor, info: { mimetype: "text/plain" } });
    expect(mapper.map(file, room)?.attachment).toMatchObject({ url: descriptor.url, encrypted: descriptor });
    file.event.content!.file = { url: "https://untrusted.example/file" };
    expect(mapper.map(file, room)?.attachment).toBeUndefined();
  });
  it("recognizes intentional incoming mentions of the signed-in user", () => {
    const event = messageEvent("m.text", "Hello Me");
    event.event.content!["m.mentions"] = { user_ids: ["@me:example"] };
    expect(mapper.map(event, room)).toMatchObject({ mentionsOwnUser: true, mentions: [{ id: "@me:example" }] });
    event.event.content!["m.mentions"] = { user_ids: ["@other:example"] };
    expect(mapper.map(event, room)?.mentionsOwnUser).toBe(false);
    (event.event.content! as Record<string, unknown>)["m.mentions"] = { user_ids: "@me:example" };
    expect(mapper.map(event, room)?.mentionsOwnUser).toBe(false);
  });
  it.each(["m.room.create", "m.room.member", "m.room.power_levels", "m.room.join_rules", "m.room.history_visibility", "m.room.guest_access", "m.room.encryption", "m.room.pinned_events", "com.example.custom_state"])("keeps %s room state out of the message timeline", type => {
    const event = new MatrixEvent({ event_id: "$state", room_id: room.roomId, sender: "@alice:example", type, state_key: "", content: {}, origin_server_ts: 1 });
    expect(mapper.map(event, room)).toBeNull();
  });

  it("keeps pending encrypted messages visible", () => {
    const event = new MatrixEvent({ event_id: "$encrypted", room_id: room.roomId, sender: "@alice:example", type: "m.room.encrypted", content: {}, origin_server_ts: 1 });
    expect(mapper.map(event, room)?.type).toBe("encrypted");
  });
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
