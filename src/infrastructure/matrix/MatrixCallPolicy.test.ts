import { describe, expect, it } from "vitest";
import { EventDirection, MatrixCapabilities, WidgetEventCapability } from "matrix-widget-api";
import { allowedCallCapabilities, elementCallUrl, ownCallStateKeys, isConversationCall } from "./MatrixCallPolicy";
import type { Room } from "matrix-js-sdk";
const user = "@alice:example.org", device = "DEVICE", room = "!call:example.org";
describe("Element Call isolation", () => {
  it.each([false, true])("can skip the lobby for a voice channel with an existing call=%s", joining => {
    const url = new URL(elementCallUrl("http://localhost/", room, user, device, "https://matrix.example.org", false, "widget", false, joining, true));
    const params = new URLSearchParams(url.hash.slice(2));
    expect(params.get("skipLobby")).toBe("true");
    expect(params.get("intent")).toBe(joining ? "join_existing_voice" : "start_call_voice");
    const preview = new URL(elementCallUrl("http://localhost/", room, user, device, "https://matrix.example.org", true, "widget"));
    expect(new URLSearchParams(preview.hash.slice(2)).has("skipLobby")).toBe(false);
  });
  it("uses ringing for standalone group chats and never for server channels, regardless of size", () => {
    const room = { roomId: "!chat", getJoinedMemberCount: () => 4, getType: () => undefined, currentState: { getStateEvents: () => [] } } as unknown as Room;
    expect(isConversationCall(room, [])).toBe(true);
    expect(isConversationCall({ ...room, getType: () => "org.matrix.msc3417.call", getJoinedMemberCount: () => 2 } as Room, [])).toBe(false);
    const server = { isSpaceRoom: () => true, currentState: { getStateEvents: () => ({ getContent: () => ({ via: ["example"] }) }) } } as unknown as Room;
    expect(isConversationCall(room, [server])).toBe(false);
    const linked = { ...room, currentState: { getStateEvents: () => [{ getContent: () => ({ via: ["example"] }) }] } } as unknown as Room;
    expect(isConversationCall(linked, [])).toBe(false);
  });
  it("grants only call events and the call room timeline", () => {
    const allowed = WidgetEventCapability.forRoomEvent(EventDirection.Send, "io.element.call.encryption_keys").raw;
    const forbidden = WidgetEventCapability.forRoomEvent(EventDirection.Send, "m.room.message").raw;
    const requested = new Set([allowed, forbidden, `org.matrix.msc2762.timeline:${room}`, "org.matrix.msc2762.timeline:*", MatrixCapabilities.MSC4515RtcTransports]);
    expect([...allowedCallCapabilities(requested, user, device, room)]).toEqual(expect.arrayContaining([allowed, `org.matrix.msc2762.timeline:${room}`, MatrixCapabilities.MSC4515RtcTransports]));
    expect(allowedCallCapabilities(requested, user, device, room).has(forbidden)).toBe(false);
    expect(allowedCallCapabilities(requested, user, device, room).has("org.matrix.msc2762.timeline:*")).toBe(false);
  });
  it("permits only this device's own membership state keys", () => {
    const requested = ownCallStateKeys(user, device).map(key => WidgetEventCapability.forStateEvent(EventDirection.Send, "org.matrix.msc3401.call.member", key).raw);
    const other = WidgetEventCapability.forStateEvent(EventDirection.Send, "org.matrix.msc3401.call.member", "@bob:example.org").raw;
    const wildcard = WidgetEventCapability.forStateEvent(EventDirection.Send, "org.matrix.msc3401.call.member").raw;
    expect(allowedCallCapabilities(new Set([...requested, other, wildcard]), user, device, room)).toEqual(new Set(requested));
  });
  it.each(["http://127.0.0.1:5173/", "grungus-app://client/index.html"])("uses local widget assets and fragment parameters for %s", parent => {
    const url = new URL(elementCallUrl(parent, room, user, device, "https://matrix.example.org", false, "widget"));
    const params = new URLSearchParams(url.hash.slice(2));
    expect(url.pathname).toBe("/element-call/index.html");
    expect(url.hostname).not.toBe(new URL(parent).hostname);
    expect(url.search).toBe("");
    expect(params.get("roomId")).toBe(room);
    expect(params.get("intent")).toBe("start_call_voice");
    expect(params.get("e2eEnabled")).toBe("true");
    expect(params.has("accessToken")).toBe(false);
  });
});

it("uses ringing intents for new DMs and join intents for ongoing calls", () => {
 const url = (direct: boolean, joining: boolean) => new URLSearchParams(new URL(elementCallUrl("http://localhost/nested/index.html", room, user, device, "https://matrix.example.org", false, "widget", direct, joining)).hash.slice(2));
 expect(url(true, false).get("intent")).toBe("start_call_dm_voice");
 expect(url(true, true).get("intent")).toBe("join_existing_dm_voice");
 expect(url(false, true).get("intent")).toBe("join_existing_voice");
});
