// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { MatrixRoom } from "../../../domain/matrix/MatrixTypes";
import { DirectMessageTab } from "./DirectMessageTab";
import { blockedUsers } from "../../../domain/settings/BlockedUsers";

afterEach(() => { cleanup(); blockedUsers.update([]); });
const room: MatrixRoom = { id: "!alice:example", name: "Alice", avatarUrl: null, topic: null, unreadCount: 2, highlightCount: 0, isEncrypted: true, membership: "join", memberCount: 2, isDirect: true };

it("updates a DM's presence while preserving selection, unread count and close actions", () => {
  const onSelect = vi.fn(), onClose = vi.fn();
  const view = render(<DirectMessageTab room={room} selected presence="online" onSelect={onSelect} onClose={onClose} />);
  const tab = screen.getByRole("button", { name: "Alice, Online, 2 unread messages" });
  expect(tab.getAttribute("aria-current")).toBe("page");
  expect(tab.querySelector(".avatar__status--online")).toBeTruthy();
  fireEvent.click(tab);
  expect(onSelect).toHaveBeenCalledWith(room.id);
  view.rerender(<DirectMessageTab room={room} selected presence="unavailable" onSelect={onSelect} onClose={onClose} />);
  expect(screen.getByText("Away")).toBeTruthy();
  expect(view.container.querySelector(".avatar__status--unavailable")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Close conversation with Alice" }));
  expect(onClose).toHaveBeenCalledWith(room.id);
  expect(onSelect).toHaveBeenCalledTimes(1);
});

it("shows unknown presence instead of assuming offline when no status is supplied", () => {
  render(<DirectMessageTab room={room} selected={false} onSelect={vi.fn()} onClose={vi.fn()} />);
  expect(screen.getByText("Status unknown")).toBeTruthy();
});
it("updates the visible badge and accessible tab label immediately when blocked or unblocked", () => {
  const view = render(<DirectMessageTab room={{ ...room, directUserId: "@alice:example" }} selected presence="online" onSelect={vi.fn()} onClose={vi.fn()} />);
  act(() => blockedUsers.update(["@alice:example"]));
  const tab = screen.getByRole("button", { name: "Alice, Blocked, Online, 2 unread messages" });
  expect(tab.classList.contains("is-blocked")).toBe(true);
  expect(screen.getByText("Blocked")).toBeDefined();
  act(() => blockedUsers.update([]));
  expect(screen.queryByText("Blocked")).toBeNull();
  expect(view.container.querySelector(".is-blocked")).toBeNull();
});
