// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { MatrixRoom, MatrixRoomMember } from "../../../domain/matrix/MatrixTypes";
import { TimelinePanel } from "./TimelinePanel";

const state = vi.hoisted(() => ({ members: [] as MatrixRoomMember[] }));
vi.mock("../../hooks/matrix/useMatrixTimeline", () => ({ useMatrixTimeline: () => ({ messages: [], members: state.members, typingMembers: [] }) }));
vi.mock("../../hooks/usePreferences", () => ({ usePreferences: () => ({ groupMessages: true, showTyping: true }) }));
vi.mock("./DirectMessageIdentity", () => ({ DirectMessageIdentity: () => null }));
vi.mock("./MessageComposer", () => ({ MessageComposer: () => null }));
vi.mock("./MessageRow", () => ({ MessageRow: () => null }));
vi.mock("../rooms/PeopleDialog", () => ({ PeopleDialog: () => null }));
const member = (name: string, presence: MatrixRoomMember["presence"], membership: MatrixRoomMember["membership"] = "join"): MatrixRoomMember => ({
  id: `@${name.toLowerCase()}:example.org`, displayName: name, avatarUrl: null, isTyping: false, membership, presence,
});
const room: MatrixRoom = { id: "!general:example", name: "General", avatarUrl: null, topic: null, unreadCount: 0, highlightCount: 0, isEncrypted: true, membership: "join", memberCount: 5 };
const props = { room, onOpenIdentity: vi.fn(), onOpenSettings: vi.fn(), onCall: vi.fn(), callActive: false };
beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  state.members = [member("Zoe", "online"), member("Alice", "online"), member("Bob", "unavailable"), member("Carol", "offline"), member("Dave", undefined), member("Left", "online", "leave")];
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("toggles a room's member sidebar from the count and groups members by presence", () => {
  render(<TimelinePanel {...props} />);
  const toggle = screen.getByRole("button", { name: "Show room members" });
  expect(toggle.textContent).toContain("5");
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  fireEvent.click(toggle);
  const sidebar = screen.getByRole("complementary", { name: "Room members" });
  expect(toggle.getAttribute("aria-expanded")).toBe("true");
  expect(within(sidebar).getAllByRole("listitem")).toHaveLength(5);
  expect(within(sidebar).queryByText("Left")).toBeNull();
  const online = within(sidebar).getByRole("region", { name: "Online" });
  expect(within(online).getAllByRole("listitem").map(item => item.querySelector("strong")?.textContent)).toEqual(["Alice", "Zoe"]);
  for (const status of ["Away", "Offline", "Status unknown"]) expect(within(sidebar).getByRole("region", { name: status })).toBeTruthy();
  fireEvent.click(toggle);
  expect(screen.queryByRole("complementary")).toBeNull();
});

it("filters members by name or Matrix ID and closes with Escape, restoring focus", () => {
  render(<TimelinePanel {...props} />);
  const toggle = screen.getByRole("button", { name: "Show room members" });
  fireEvent.click(toggle);
  const search = screen.getByRole("searchbox", { name: "Find a room member" });
  expect(document.activeElement).toBe(search);
  fireEvent.change(search, { target: { value: "@bob:example" } });
  expect(screen.getAllByRole("listitem")).toHaveLength(1);
  expect(screen.getByText("Bob")).toBeTruthy();
  fireEvent.change(search, { target: { value: "nobody" } });
  expect(screen.getByText("No members found.")).toBeTruthy();
  fireEvent.keyDown(search, { key: "Escape" });
  expect(screen.queryByRole("complementary")).toBeNull();
  expect(document.activeElement).toBe(toggle);
});

it("updates visible presence groups without reopening the member list", () => {
  const view = render(<TimelinePanel {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Show room members" }));
  state.members = [member("Alice", "offline")];
  view.rerender(<TimelinePanel {...props} />);
  expect(screen.queryByRole("region", { name: "Online" })).toBeNull();
  expect(within(screen.getByRole("region", { name: "Offline" })).getByText("Alice")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Close member list" }));
  expect(screen.queryByRole("complementary")).toBeNull();
});

it("provides pins and regular calls without classic-call options in channels and DMs", () => {
  const view = render(<TimelinePanel {...props} />);
  expect(screen.getByRole("button", { name: "Pinned messages" })).toBeTruthy();
  view.rerender(<TimelinePanel {...props} room={{ ...room, isDirect: true, memberCount: 2 }} />);
  expect(screen.getByRole("button", { name: "Pinned messages" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Start voice call" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Start video call" })).toBeTruthy();
  expect(document.querySelector(".call-options")).toBeNull();
});
