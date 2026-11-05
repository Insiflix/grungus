// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StreamLiveBadge } from "./StreamLiveBadge";
import { voiceActivity } from "../../../domain/calls/VoiceActivity";
afterEach(cleanup);

it("shows the stream notice only while hovering LIVE and forwards the watch action", async () => {
  const onWatch = vi.fn();
  const remove = voiceActivity.onWatch(onWatch);
  render(<StreamLiveBadge roomId="!voice" streams={[{ userId: "@alice:test", name: "Alice", source: "screen_share" }]} />);
  expect(screen.queryByRole("dialog")).toBeNull();
  const badge = screen.getByRole("button", { name: "Live stream from Alice" });
  fireEvent.pointerEnter(badge);
  expect(screen.getByRole("dialog", { name: "Available streams" })).toBeTruthy();
  fireEvent.pointerLeave(badge);
  fireEvent.pointerEnter(screen.getByRole("dialog"));
  expect(screen.getByRole("button", { name: "Watch stream" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Watch stream" }));
  expect(onWatch).toHaveBeenCalledWith({ roomId: "!voice", userId: "@alice:test", source: "screen_share" });
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.focus(badge);
  fireEvent.keyDown(badge, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  remove();
});
