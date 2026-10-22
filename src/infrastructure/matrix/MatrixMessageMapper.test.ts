import { describe, expect, it, vi } from "vitest";
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
  it.each(["request", "ready", "start", "accept", "key", "mac", "done", "cancel"])("hides verification %s protocol events, including decrypted events", phase => {
    const type = `m.key.verification.${phase}`;
    const event = new MatrixEvent({ event_id: "$verification", room_id: room.roomId, sender: "@alice:example", type, content: {}, origin_server_ts: 1 });
    expect(mapper.map(event, room)).toBeNull();
    const encrypted = new MatrixEvent({ event_id: "$encrypted-verification", room_id: room.roomId, sender: "@alice:example", type: "m.room.encrypted", content: {}, origin_server_ts: 1 });
    vi.spyOn(encrypted, "getType").mockReturnValue(type);
    vi.spyOn(encrypted, "getContent").mockReturnValue({});
    expect(mapper.map(encrypted, room)).toBeNull();
  });

  it("hides the verification request fallback without hiding ordinary messages about verification", () => {
    const fallback = "This client does not support in-chat key verification.";
    const event = messageEvent("m.key.verification.request", fallback);
    expect(mapper.map(event, room)).toBeNull();
    const encrypted = new MatrixEvent({ event_id: "$encrypted-request", type: "m.room.encrypted", room_id: room.roomId, content: {}, origin_server_ts: 1 });
    vi.spyOn(encrypted, "getType").mockReturnValue("m.room.message");
    vi.spyOn(encrypted, "getContent").mockReturnValue(event.getContent());
    expect(mapper.map(encrypted, room)).toBeNull();
    expect(mapper.map(messageEvent("m.text", fallback), room)?.body).toBe(fallback);
  });
  it.each([["m.video", "video", "video/mp4"], ["m.audio", "audio", "audio/ogg"]])("maps native %s messages and encrypted media descriptors", (msgtype, type, mimeType) => {
    const event = messageEvent(msgtype, "media");
    const encrypted = { url: "mxc://example/encrypted", v: "v2", key: {}, iv: "iv", hashes: {} };
    Object.assign(event.event.content!, { file: encrypted, info: { mimetype: mimeType } });
    expect(mapper.map(event, room)).toMatchObject({ type, attachment: { mimeType, encrypted, url: encrypted.url } });
  });
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

it("maps encrypted video previews and native audio duration/waveforms without accepting external poster URLs", () => {
  const video = messageEvent("m.video", "private.mp4");
  const thumbnail = { url: "mxc://example/poster", v: "v2", key: {}, iv: "iv", hashes: {} };
  Object.assign(video.event.content!, { url: "mxc://example/video", info: { mimetype: "video/mp4", duration: 3200, thumbnail_file: thumbnail, thumbnail_info: { mimetype: "image/jpeg", w: 320, h: 180 } } });
  expect(mapper.map(video, room)?.attachment).toMatchObject({ durationMs: 3200, thumbnail: { url: thumbnail.url, mimeType: "image/jpeg", encrypted: thumbnail } });
  const audio = messageEvent("m.audio", "voice.ogg");
  Object.assign(audio.event.content!, { url: "mxc://example/voice", info: { mimetype: "audio/ogg" }, "org.matrix.msc1767.audio": { duration: 5000, waveform: [0, 500, 50000, -1] }, "org.matrix.msc3245.voice": {} });
  expect(mapper.map(audio, room)?.attachment).toMatchObject({ durationMs: 5000, voice: true, waveform: [0, 500, 1024, 0] });
  Object.assign(video.event.content!, { info: { thumbnail_url: "https://external.example/poster", thumbnail_info: { mimetype: "image/jpeg" } } });
  expect(mapper.map(video, room)?.attachment?.thumbnail).toBeUndefined();
});


describe("membership timeline notices", () => {
  function member(membership: string, previous: string, sender = "@alice:example") {
    return new MatrixEvent({ event_id: "$member", room_id: room.roomId, type: "m.room.member", state_key: "@alice:example", sender, origin_server_ts: 1,
      content: { membership, displayname: "Alice" }, unsigned: { prev_content: { membership: previous, displayname: "Alice" } } });
  }
  it.each([
    ["join", "invite", "Alice joined the room.", "join"],
    ["leave", "join", "Alice left the room.", "leave"],
  ])("maps %s transitions", (membership, previous, body, change) => {
    expect(mapper.map(member(membership, previous), room)).toMatchObject({ type: "membership", body, membershipChange: change });
  });
  it.each([["join", "join"], ["leave", "invite"], ["invite", "leave"], ["leave", "leave"]])("ignores %s after %s", (membership, previous) => {
    expect(mapper.map(member(membership, previous), room)).toBeNull();
  });
  it("distinguishes removal and banning from voluntary departure", () => {
    expect(mapper.map(member("leave", "join", "@moderator:example"), room)?.body).toBe("Alice was removed from the room by moderator.");
    expect(mapper.map(member("ban", "join", "@moderator:example"), room)?.body).toBe("Alice was banned from the room by moderator.");
  });
  it("labels space membership accurately", () => {
    const space = new Room("!space:example", client, "@me:example");
    vi.spyOn(space, "isSpaceRoom").mockReturnValue(true);
    expect(mapper.map(member("join", "leave"), space)?.body).toBe("Alice joined the space.");
  });
});
