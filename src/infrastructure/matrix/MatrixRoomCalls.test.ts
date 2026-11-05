import { beginLocalCall } from "./MatrixLocalCallState";
import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { ClientEvent, type MatrixClient } from "matrix-js-sdk";
import { MatrixRTCSessionEvent } from "matrix-js-sdk/lib/matrixrtc";
import { observeRoomCalls } from "./MatrixRoomCalls";

describe("voice channel participants", () => {
  it("observes participants without joining media, across initial sync, empty calls, and session replacement", () => {
    const empty = Object.assign(new EventEmitter(), { memberships: [] as { userId: string }[] });
    let session = empty;
    const manager = Object.assign(new EventEmitter(), { getRoomSession: vi.fn(() => session) });
    const room = { roomId: "!voice", name: "Lounge", getMyMembership: () => "join", getMember: () => null };
    let rooms: typeof room[] = [];
    const client = Object.assign(new EventEmitter(), { matrixRTC: manager, getRooms: () => rooms }) as unknown as MatrixClient;
    const listener = vi.fn();
    const dispose = observeRoomCalls(client, listener);
    rooms = [room]; client.emit(ClientEvent.Room, room as never);
    empty.memberships = [{ userId: "@alice:example" }]; empty.emit(MatrixRTCSessionEvent.MembershipsChanged);
    expect(listener.mock.lastCall![0][0].members[0].id).toBe("@alice:example");
    session = Object.assign(new EventEmitter(), { memberships: [{ userId: "@bob:example" }] });
    client.emit(ClientEvent.Sync, "PREPARED" as never, null, undefined);
    expect(listener.mock.lastCall![0][0].members[0].id).toBe("@bob:example");
    expect(empty.listenerCount(MatrixRTCSessionEvent.MembershipsChanged)).toBe(0);
    session.memberships = []; session.emit(MatrixRTCSessionEvent.MembershipsChanged);
    expect(listener).toHaveBeenLastCalledWith([]);
    session.memberships = [{ userId: "@carol:example" }]; session.emit(MatrixRTCSessionEvent.MembershipsChanged);
    expect(listener.mock.lastCall![0][0].participants).toBe(1);
    dispose();
    expect(session.listenerCount(MatrixRTCSessionEvent.MembershipsChanged)).toBe(0);
    expect(client.listenerCount(ClientEvent.Sync)).toBe(0);
  });
  it("lists people once across devices and updates as they leave", () => {
    const session = Object.assign(new EventEmitter(), { memberships: [{ userId: "@alice:example" }, { userId: "@alice:example" }, { userId: "@bob:example" }] });
    const manager = Object.assign(new EventEmitter(), { getRoomSession: () => session });
    const client = { ...new EventEmitter(), on: EventEmitter.prototype.on, off: EventEmitter.prototype.off, matrixRTC: manager, getRooms: () => [{ roomId: "!voice", name: "Lounge", getMyMembership: () => "join", getMember: (id: string) => ({ name: id === "@alice:example" ? "Alice" : "Bob", getMxcAvatarUrl: () => null }) }] } as unknown as MatrixClient;
    const listener = vi.fn();
    const dispose = observeRoomCalls(client, listener);
    expect(listener).toHaveBeenLastCalledWith([{ roomId: "!voice", name: "Lounge", participants: 2, members: [
      { id: "@alice:example", displayName: "Alice", avatarUrl: null }, { id: "@bob:example", displayName: "Bob", avatarUrl: null },
    ] }]);
    session.memberships = [];
    session.emit(MatrixRTCSessionEvent.MembershipsChanged);
    expect(listener).toHaveBeenLastCalledWith([]);
    dispose();
    expect(session.listenerCount(MatrixRTCSessionEvent.MembershipsChanged)).toBe(0);
  });
});

it("removes the departing device immediately while sync still lists it, preserving other users and devices", () => {
  const session = Object.assign(new EventEmitter(), { memberships: [
    { userId: "@alice:example", deviceId: "THIS" }, { userId: "@bob:example", deviceId: "BOB" },
  ] });
  const manager = Object.assign(new EventEmitter(), { getRoomSession: () => session });
  const client = { ...new EventEmitter(), on: EventEmitter.prototype.on, off: EventEmitter.prototype.off, matrixRTC: manager, getUserId: () => "@alice:example", getDeviceId: () => "THIS", getRooms: () => [{ roomId: "!voice", name: "Lounge", getMyMembership: () => "join", getMember: () => null }] } as unknown as MatrixClient;
  const listener = vi.fn(); const dispose = observeRoomCalls(client, listener);
  const call = beginLocalCall(client, "!voice"); call.joined(); call.left();
  expect(listener.mock.lastCall![0][0].members.map((member: { id: string }) => member.id)).toEqual(["@bob:example"]);
  session.emit(MatrixRTCSessionEvent.MembershipsChanged);
  expect(listener.mock.lastCall![0][0].participants).toBe(1);
  session.memberships.push({ userId: "@alice:example", deviceId: "OTHER" });
  session.emit(MatrixRTCSessionEvent.MembershipsChanged);
  expect(listener.mock.lastCall![0][0].participants).toBe(2);
  session.memberships = [{ userId: "@alice:example", deviceId: "THIS" }];
  session.emit(MatrixRTCSessionEvent.MembershipsChanged);
  expect(listener).toHaveBeenLastCalledWith([]);
  const next = beginLocalCall(client, "!voice");
  next.joined(); expect(listener.mock.lastCall![0][0].participants).toBe(1);
  call.left(); expect(listener.mock.lastCall![0][0].participants).toBe(1);
  const count = listener.mock.calls.length; dispose(); next.left(); expect(listener).toHaveBeenCalledTimes(count);
});
