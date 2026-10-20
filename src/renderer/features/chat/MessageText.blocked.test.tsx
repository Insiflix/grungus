// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { MessageText } from "./MessageText";
import { blockedUsers } from "../../../domain/settings/BlockedUsers";
import type { MatrixMessage } from "../../../domain/matrix/MatrixTypes";
afterEach(() => { cleanup(); blockedUsers.update([]); });
it("marks user mention tags as blocked and updates them on unblock", () => {
  const alice = { id: "@alice:test", displayName: "Alice", avatarUrl: null };
  const message: MatrixMessage = { id: "$one", roomId: "!room", sender: alice, body: "Hello @alice:test", mentions: [alice], timestamp: 1, type: "text", edited: false, replyTo: null, reactions: [], sendState: "sent", isOwn: false, isRedacted: false };
  render(<MessageText message={message} convertEmoji={false} />);
  act(() => blockedUsers.update([alice.id]));
  const tag = screen.getByText("@Alice · Blocked");
  expect(tag.classList.contains("message-mention--blocked")).toBe(true);
  expect(tag.getAttribute("data-tooltip")).toContain("Blocked user");
  act(() => blockedUsers.update([]));
  expect(screen.getByText("@Alice")).toBeDefined();
  expect(screen.queryByText("@Alice · Blocked")).toBeNull();
});
