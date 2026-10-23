import { describe, expect, it } from "vitest";
import type { MatrixRoom } from "./MatrixTypes";
import { canJoinChannel, isVoiceRoom, spaceRoomIds } from "./RoomNavigation";
const base: MatrixRoom = { id: "!space", name: "Server", avatarUrl: null, topic: null, unreadCount: 0, highlightCount: 0, isEncrypted: false, membership: "join", memberCount: 2 };
describe("server navigation", () => {
  it("separates nested server channels from group chats and ignores spaces that have been left", () => {
    expect([...spaceRoomIds([{ ...base, childRoomIds: ["!text"] }], { "!space": [{ ...base, id: "!nested-voice" }], "!left-space": [{ ...base, id: "!old-chat" }] })]).toEqual(["!text", "!nested-voice"]);
  });
  it("distinguishes voice channel types and access rules", () => {
    expect(isVoiceRoom({ ...base, roomType: "org.matrix.msc3417.call" })).toBe(true);
    expect(isVoiceRoom({ ...base, roomType: "io.element.video" })).toBe(true);
    expect(isVoiceRoom(base)).toBe(false);
    expect(canJoinChannel({ ...base, membership: "leave", joinRule: "public" })).toBe(true);
    expect(canJoinChannel({ ...base, membership: "leave", joinRule: "restricted" })).toBe(true);
    expect(canJoinChannel({ ...base, membership: "leave", joinRule: "invite" })).toBe(false);
    expect(canJoinChannel({ ...base, membership: "leave", joinRule: undefined })).toBe(true);
    expect(canJoinChannel({ ...base, membership: "ban", joinRule: "public" })).toBe(false);
  });
});
