// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { MatrixPeerVerification, MatrixRoom } from "../../../domain/matrix/MatrixTypes";
import { DirectMessageIdentity } from "./DirectMessageIdentity";
const state = vi.hoisted(() => ({ listeners: new Map<string, (status: MatrixPeerVerification) => void>(), dispose: vi.fn() }));
vi.mock("../../app/providers/MatrixProvider", () => ({ useMatrixRuntime: () => runtime }));
const runtime = {
  getSnapshot: () => ({ session: { userId: "@self:test" } }),
  observeUserVerification: (id: string, listener: (status: MatrixPeerVerification) => void) => { state.listeners.set(id, listener); return state.dispose; },
};
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
