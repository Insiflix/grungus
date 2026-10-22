// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { MatrixMessage } from "../../../domain/matrix/MatrixTypes";
import { PinnedMessages } from "./PinnedMessages";

const message: MatrixMessage = { id: "$old", roomId: "!room:test", sender: { id: "@alice:test", displayName: "Alice", avatarUrl: null }, timestamp: 1, type: "text", body: "An older pinned message", edited: false, replyTo: null, reactions: [], sendState: "sent", isOwn: false, isRedacted: false, isPinned: true };
afterEach(cleanup);
it("loads pins outside the visible history and opens their context", async () => {
  const load = vi.fn().mockResolvedValue([message]);
  const onOpen = vi.fn().mockResolvedValue(undefined);
  render(<PinnedMessages pinnedEventIds={[message.id]} messages={[]} load={load} onOpen={onOpen} />);
  expect(load).not.toHaveBeenCalled();
  const trigger = screen.getByRole("button", { name: "Pinned messages" });
  fireEvent.click(trigger);
  fireEvent.click(await screen.findByRole("button", { name: /An older pinned message/ }));
  await waitFor(() => expect(onOpen).toHaveBeenCalledWith(message));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(document.activeElement).toBe(trigger);
});
it("updates an open list when room pins change and closes with Escape", async () => {
  const load = vi.fn().mockResolvedValue([message]);
  const onOpen = vi.fn();
  const view = render(<PinnedMessages pinnedEventIds={[message.id]} messages={[]} load={load} onOpen={onOpen} />);
  fireEvent.click(screen.getByRole("button", { name: "Pinned messages" }));
  await screen.findByText(message.body);
  load.mockResolvedValue([]);
  view.rerender(<PinnedMessages pinnedEventIds={[]} messages={[]} load={load} onOpen={onOpen} />);
  await screen.findByText("No pinned messages in this conversation.");
  fireEvent.keyDown(screen.getByRole("button", { name: "Close pinned messages" }), { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
});
it("offers retry after a load failure", async () => {
  const load = vi.fn().mockRejectedValueOnce(new Error("Offline")).mockResolvedValue([]);
  render(<PinnedMessages messages={[]} load={load} onOpen={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Pinned messages" }));
  await screen.findByText("Offline");
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByText("No pinned messages in this conversation.");
});
