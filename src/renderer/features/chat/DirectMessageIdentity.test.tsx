// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { MatrixPeerVerification, MatrixRoom } from "../../../domain/matrix/MatrixTypes";
import { DirectMessageIdentity } from "./DirectMessageIdentity";
const state = vi.hoisted(() => ({ listeners: new Map<string, (status: MatrixPeerVerification) => void>(), dispose: vi.fn() }));
vi.mock("../../app/providers/MatrixProvider", () => ({ useMatrixRuntime: () => runtime }));
const runtime = {
  acceptUserIdentity: vi.fn(async (_userId: string) => undefined),
  getSnapshot: () => ({ session: { userId: "@self:test" } }),
  observeUserVerification: (id: string, listener: (status: MatrixPeerVerification) => void) => { state.listeners.set(id, listener); return state.dispose; },
};

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute("open", ""); });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) { this.removeAttribute("open"); });
  runtime.acceptUserIdentity.mockReset().mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); state.listeners.clear(); vi.clearAllMocks(); });
const room: MatrixRoom = { id: "!dm:test", name: "Alice", avatarUrl: null, topic: null, membership: "join", unreadCount: 0, highlightCount: 0, isEncrypted: true, isDirect: true, memberCount: 2, directUserId: "@alice:test" };
it("shows the peer avatar, presence and current verification, resetting when the peer changes", async () => {
  const view = render(<DirectMessageIdentity room={room} members={[{ id: "@alice:test", displayName: "Alice", avatarUrl: "https://example.org/alice.png", isTyping: false, membership: "join", presence: "unavailable" }]} />);
  expect(screen.getByText("Away")).toBeTruthy();
  await waitFor(() => expect(view.container.querySelector('.avatar img')?.getAttribute("src")).toBe("https://example.org/alice.png"));
  expect(screen.getByText("Checking verification...")).toBeTruthy();
  act(() => state.listeners.get("@alice:test")!("verified"));
  expect(screen.getByText("Verified")).toBeTruthy();
  act(() => state.listeners.get("@alice:test")!("changed"));
  expect(screen.getByText("Identity changed")).toBeTruthy();
  view.rerender(<DirectMessageIdentity room={{ ...room, directUserId: "@bob:test", name: "Bob" }} members={[]} />);
  expect(screen.queryByText("Identity changed")).toBeNull();
  expect(screen.getByText("Checking verification...")).toBeTruthy();
  expect(state.dispose).toHaveBeenCalledTimes(1);
});

it("requires confirmation, accepts the peer and shows the refreshed unverified status", async () => {
  render(<DirectMessageIdentity room={room} members={[]} />);
  act(() => state.listeners.get("@alice:test")!("changed"));
  fireEvent.click(screen.getByRole("button", { name: "Accept new identity" }));
  let dialog = screen.getByRole("dialog");
  expect(within(dialog).getByText(/It does not verify their identity/)).toBeTruthy();
  expect(runtime.acceptUserIdentity).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Accept new identity" }));
  dialog = screen.getByRole("dialog");
  runtime.acceptUserIdentity.mockImplementationOnce(async id => { state.listeners.get(id)!("unverified"); });
  fireEvent.click(within(dialog).getByRole("button", { name: "Accept new identity" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(runtime.acceptUserIdentity).toHaveBeenCalledExactlyOnceWith("@alice:test");
  expect(screen.getByText("Not verified")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Accept new identity" })).toBeNull();
});

it("shows acceptance errors and allows retry", async () => {
  render(<DirectMessageIdentity room={room} members={[]} />);
  act(() => state.listeners.get("@alice:test")!("changed"));
  fireEvent.click(screen.getByRole("button", { name: "Accept new identity" }));
  runtime.acceptUserIdentity.mockRejectedValueOnce(new Error("Unable to accept identity"));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Accept new identity" }));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Unable to accept identity"));
  expect(screen.getByText("Identity changed")).toBeTruthy();
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Accept new identity" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(runtime.acceptUserIdentity).toHaveBeenCalledTimes(2);
});

it("closes the confirmation when switching to another peer", () => {
  const view = render(<DirectMessageIdentity room={room} members={[]} />);
  act(() => state.listeners.get("@alice:test")!("changed"));
  fireEvent.click(screen.getByRole("button", { name: "Accept new identity" }));
  view.rerender(<DirectMessageIdentity room={{ ...room, directUserId: "@bob:test" }} members={[]} />);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(runtime.acceptUserIdentity).not.toHaveBeenCalled();
});
