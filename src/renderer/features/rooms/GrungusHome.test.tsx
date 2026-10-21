// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { MatrixRoom } from "../../../domain/matrix/MatrixTypes";
import { GrungusHome } from "./GrungusHome";
const mocks = vi.hoisted(() => ({
  runtime: { getRoomMembers: vi.fn(() => [
    { id: "@me:example", displayName: "Me", avatarUrl: null, membership: "join" },
    { id: "@alice:example", displayName: "Alice", avatarUrl: null, membership: "join" },
    { id: "@bob:example", displayName: "Bob", avatarUrl: null, membership: "join" },
    { id: "@left:example", displayName: "Left", avatarUrl: null, membership: "leave" },
  ]), searchUsers: vi.fn(async (_term: string) => [{ id: "@carol:example", displayName: "Carol", avatarUrl: null }]), startDirectMessage: vi.fn(async (_id: string) => {}) },
  snapshot: { session: { userId: "@me:example" }, presences: { "@alice:example": "online" }, timelines: {} },
}));
vi.mock("../../app/providers/MatrixProvider", () => ({ useMatrixRuntime: () => mocks.runtime }));
vi.mock("../../hooks/matrix/useMatrixSnapshot", () => ({ useMatrixSnapshot: () => mocks.snapshot }));
vi.mock("../../components/common/Avatar", () => ({ Avatar: () => null }));
vi.mock("../../components/common/BlockedUserBadge", () => ({ BlockedUserBadge: () => null }));
const base: MatrixRoom = { id: "!general", name: "General", avatarUrl: null, topic: null, unreadCount: 3, highlightCount: 1, membership: "join", memberCount: 3, isEncrypted: false };
const server = { ...base, id: "!server", name: "Forest", isSpace: true };
const voice = { ...base, id: "!voice", name: "Lounge", unreadCount: 0, roomType: "org.matrix.msc3417.call" };
const rooms = [base, voice];
const channelServers = new Map([[base.id, server], [voice.id, server]]);
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it("lists shared-room contacts without existing DMs and opens a new conversation", async () => {
  render(<GrungusHome rooms={rooms} calls={[]} channelServers={channelServers} onOpen={vi.fn()} onJoinVoice={vi.fn()} callActive={false} />);
  expect(screen.queryByRole("button", { name: "Message Me" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Message Left" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Message Bob" }));
  await waitFor(() => expect(mocks.runtime.startDirectMessage).toHaveBeenCalledWith("@bob:example"));
  fireEvent.click(screen.getByRole("button", { name: "Online" }));
  expect(screen.getByRole("button", { name: "Message Alice" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Message Bob" })).toBeNull();
});
it("searches the directory for contacts outside existing conversations", async () => {
  render(<GrungusHome rooms={rooms} calls={[]} channelServers={channelServers} onOpen={vi.fn()} onJoinVoice={vi.fn()} callActive={false} />);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Carol" } });
  await waitFor(() => expect(screen.getByRole("button", { name: "Message Carol" })).toBeTruthy());
  expect(mocks.runtime.searchUsers).toHaveBeenCalledWith("Carol");
  expect(screen.queryByRole("button", { name: "Message Bob" })).toBeNull();
});
it("opens missed channels and joins live voice calls without stream previews", () => {
  const onOpen = vi.fn(), onJoinVoice = vi.fn();
  render(<GrungusHome rooms={rooms} calls={[{ roomId: voice.id, name: voice.name, participants: 1, members: [{ id: "@alice:example", displayName: "Alice in voice", avatarUrl: null }] }]} channelServers={channelServers} onOpen={onOpen} onJoinVoice={onJoinVoice} callActive={false} />);
  fireEvent.click(screen.getByRole("button", { name: /General.*3 unread/ }));
  expect(onOpen).toHaveBeenCalledWith(base.id);
  expect(screen.getByText("Alice in voice")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Join voice" }));
  expect(onJoinVoice).toHaveBeenCalledWith(voice);
  expect(document.querySelector("video, iframe")).toBeNull();
});
