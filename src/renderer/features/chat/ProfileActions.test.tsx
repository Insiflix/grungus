// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { MatrixPeerVerification } from "../../../domain/matrix/MatrixTypes";
import { ProfileActions } from "./ProfileActions";

const state = vi.hoisted(() => ({ status: "unverified" as MatrixPeerVerification, listener: null as ((status: MatrixPeerVerification) => void) | null, dispose: vi.fn() }));
vi.mock("../../app/providers/MatrixProvider", () => ({ useMatrixRuntime: () => runtime }));
const runtime = {
  getSnapshot: () => ({ session: { userId: "@me:test" } }),
  observeUserVerification: vi.fn((_id: string, listener: (status: MatrixPeerVerification) => void) => { state.listener = listener; listener(state.status); return state.dispose; }),
  startDirectMessage: vi.fn(async (_id: string) => undefined),
  requestUserVerification: vi.fn(async (_id: string) => undefined),
};
afterEach(() => { cleanup(); vi.clearAllMocks(); state.status = "unverified"; state.listener = null; });
function setup(userId = "@alice:test") {
  const onVerification = vi.fn();
  const messageMenu = vi.fn();
  render(<><ProfileActions onVerification={onVerification} /><div onContextMenu={messageMenu}><strong data-profile-user-id={userId}>Alice</strong><span>Message body</span></div></>);
  fireEvent.contextMenu(screen.getByText("Alice"), { clientX: 25, clientY: 40 });
  return { onVerification, messageMenu };
}
it("offers verification for an unverified profile and opens the comparison after sending", async () => {
  const { onVerification, messageMenu } = setup();
  expect(messageMenu).not.toHaveBeenCalled();
  expect(screen.getByRole("menuitem", { name: "Send DM" })).toBeTruthy();
  fireEvent.click(screen.getByRole("menuitem", { name: "Verify user" }));
  await waitFor(() => expect(onVerification).toHaveBeenCalledOnce());
  expect(runtime.requestUserVerification).toHaveBeenCalledExactlyOnceWith("@alice:test");
  expect(screen.queryByRole("menu")).toBeNull();
});
it("hides verification for verified profiles, updates changed identities, and opens DMs", async () => {
  state.status = "verified";
  setup();
  expect(screen.queryByRole("menuitem", { name: "Verify user" })).toBeNull();
  act(() => state.listener!("changed"));
  expect(screen.getByRole("menuitem", { name: "Verify user" })).toBeTruthy();
  fireEvent.click(screen.getByRole("menuitem", { name: "Send DM" }));
  await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  expect(runtime.startDirectMessage).toHaveBeenCalledExactlyOnceWith("@alice:test");
});
it("preserves errors and allows verification to be retried", async () => {
  const { onVerification } = setup();
  runtime.requestUserVerification.mockRejectedValueOnce(new Error("Contact unavailable"));
  fireEvent.click(screen.getByRole("menuitem", { name: "Verify user" }));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Contact unavailable"));
  expect(onVerification).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("menuitem", { name: "Verify user" }));
  await waitFor(() => expect(onVerification).toHaveBeenCalledOnce());
});
it("leaves self profiles and message bodies to their existing menus", () => {
  const { messageMenu } = setup("@me:test");
  expect(screen.queryByRole("menu")).toBeNull();
  fireEvent.contextMenu(screen.getByText("Message body"));
  expect(messageMenu).toHaveBeenCalledTimes(2);
});
it("supports keyboard dismissal and unsubscribes from trust updates", () => {
  setup();
  fireEvent.keyDown(screen.getByRole("menu"), { key: "ArrowDown" });
  expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Verify user" }));
  fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
  expect(screen.queryByRole("menu")).toBeNull();
  expect(state.dispose).toHaveBeenCalledOnce();
});
