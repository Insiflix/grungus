import { participantAudio } from "../../../domain/calls/ParticipantAudio";
// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { MatrixPeerVerification } from "../../../domain/matrix/MatrixTypes";
import { ProfileActions } from "./ProfileActions";

const state = vi.hoisted(() => ({ status: "unverified" as MatrixPeerVerification, listener: null as ((status: MatrixPeerVerification) => void) | null, dispose: vi.fn() }));
vi.mock("../../app/providers/MatrixProvider", () => ({ useMatrixRuntime: () => runtime, get matrixSettings() { return settings; } }));
const snapshot = { session: { userId: "@me:test" }, selectedRoomId: "!dm:test", rooms: [{ id: "!dm:test", name: "Alice" }, { id: "!server:test", name: "Forest", isSpace: true, membership: "join" }] };
const settings = { canInviteToRoom: vi.fn(async (_room: string, _user: string) => true), setIgnored: vi.fn(async () => {}) };
const runtime = {
  subscribe: () => () => {},
  inviteUser: vi.fn(async () => {}),
  getSnapshot: () => snapshot,
  observeUserVerification: vi.fn((_id: string, listener: (status: MatrixPeerVerification) => void) => { state.listener = listener; listener(state.status); return state.dispose; }),
  startDirectMessage: vi.fn(async (_id: string) => undefined),
  requestUserVerification: vi.fn(async (_id: string) => undefined),
};
afterEach(() => { cleanup(); vi.clearAllMocks(); state.status = "unverified"; state.listener = null; });
function setup(userId = "@alice:test", voiceRoomId?: string) {
  const onVerification = vi.fn();
  const onCall = vi.fn();
  const messageMenu = vi.fn();
  render(<><ProfileActions onVerification={onVerification} onCall={onCall} /><div onContextMenu={messageMenu}><strong data-profile-user-id={userId} data-voice-room-id={voiceRoomId}>Alice</strong><span>Message body</span></div></>);
  fireEvent.contextMenu(screen.getByText("Alice"), { clientX: 25, clientY: 40 });
  return { onVerification, messageMenu, onCall };
}
it("offers verification for an unverified profile and opens the comparison after sending", async () => {
  const { onVerification, messageMenu } = setup();
  expect(messageMenu).not.toHaveBeenCalled();
  expect(screen.getByRole("menuitem", { name: "Message" })).toBeTruthy();
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
  fireEvent.click(screen.getByRole("menuitem", { name: "Message" }));
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
  expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Start a Call" }));
  fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
  expect(screen.queryByRole("menu")).toBeNull();
  expect(state.dispose).toHaveBeenCalledOnce();
});

it("starts a call in the opened DM", async () => {
  const { onCall } = setup();
  fireEvent.click(screen.getByRole("menuitem", { name: "Start a Call" }));
  await waitFor(() => expect(onCall).toHaveBeenCalledWith(snapshot.rooms[0]));
});
it("expands servers and sends the selected invitation", async () => {
  setup(); fireEvent.click(screen.getByRole("menuitem", { name: "Invite to server" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "Forest" }));
  await waitFor(() => expect(runtime.inviteUser).toHaveBeenCalledWith("!server:test", "@alice:test"));
});
it("blocks users and copies Matrix IDs", async () => {
  setup(); fireEvent.click(screen.getByRole("menuitem", { name: "Block" }));
  await waitFor(() => expect(settings.setIgnored).toHaveBeenCalledWith("@alice:test", true));
  cleanup(); const writeText = vi.fn(async () => {}); Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  setup(); fireEvent.click(screen.getByRole("menuitem", { name: "Copy user ID" }));
  await waitFor(() => expect(writeText).toHaveBeenCalledWith("@alice:test"));
});

it("adjusts local voice volume up to 200% and mutes only the selected participant", async () => {
  const apply = vi.fn(async () => {});
  const unregister = participantAudio.register("!voice:test", apply);
  try {
    setup("@alice:test", "!voice:test");
    const slider = screen.getByRole("slider", { name: "User volume" });
    fireEvent.change(slider, { target: { value: "175" } }); fireEvent.pointerUp(slider);
    await waitFor(() => expect(apply).toHaveBeenCalledWith("@alice:test", { volume: 175, muted: false }));
    const mute = screen.getByRole("menuitemcheckbox", { name: "Mute for me" });
    await waitFor(() => expect(mute).toHaveProperty("disabled", false));
    fireEvent.click(mute);
    await waitFor(() => expect(apply).toHaveBeenLastCalledWith("@alice:test", { volume: 175, muted: true }));
    expect(screen.getByRole("menuitemcheckbox", { name: "Unmute for me" }).getAttribute("aria-checked")).toBe("true");
  } finally { unregister(); }
});
it("disables voice controls outside the connected channel", () => {
  setup("@alice:test", "!other-voice:test");
  expect(screen.getByRole("slider", { name: "User volume" })).toHaveProperty("disabled", true);
  expect(screen.getByRole("menuitemcheckbox", { name: "Mute for me" })).toHaveProperty("disabled", true);
});

it("hides servers where the selected user cannot be invited", async () => {
  settings.canInviteToRoom.mockResolvedValueOnce(false);
  setup(); fireEvent.click(screen.getByRole("menuitem", { name: "Invite to server" }));
  await screen.findByText("No servers available to invite to.");
  expect(settings.canInviteToRoom).toHaveBeenCalledWith("!server:test", "@alice:test");
  expect(screen.queryByRole("menuitem", { name: "Forest" })).toBeNull();
});
it("rechecks invite permissions before sending and removes a server if permissions changed", async () => {
  settings.canInviteToRoom.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
  setup(); fireEvent.click(screen.getByRole("menuitem", { name: "Invite to server" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "Forest" }));
  await screen.findByRole("alert");
  expect(runtime.inviteUser).not.toHaveBeenCalled();
  expect(screen.queryByRole("menuitem", { name: "Forest" })).toBeNull();
});
it("removes servers rejected by the homeserver without showing raw Matrix errors", async () => {
  runtime.inviteUser.mockRejectedValueOnce(Object.assign(new Error("Event is not supported"), { httpStatus: 403, errcode: "M_FORBIDDEN" }));
  setup(); fireEvent.click(screen.getByRole("menuitem", { name: "Invite to server" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "Forest" }));
  expect((await screen.findByRole("alert")).textContent).toContain("does not allow you to invite");
  expect(screen.queryByRole("menuitem", { name: "Forest" })).toBeNull();
  fireEvent.click(screen.getByRole("menuitem", { name: "Invite to server" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Invite to server" }));
  await screen.findByText("No servers available to invite to.");
  expect(screen.queryByRole("menuitem", { name: "Forest" })).toBeNull();
});
