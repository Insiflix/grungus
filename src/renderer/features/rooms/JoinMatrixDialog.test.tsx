// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { JoinMatrixDialog } from "./JoinMatrixDialog";

const mocks = vi.hoisted(() => ({
  searchPublicRooms: vi.fn(), joinRoom: vi.fn(),
  getSnapshot: () => ({ selectedRoomId: "!remote" }),
}));
vi.mock("../../app/providers/MatrixProvider", () => ({ useMatrixRuntime: () => mocks }));
HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
afterEach(() => { cleanup(); vi.resetAllMocks(); });

it("browses a remote directory and joins through its server", async () => {
  mocks.searchPublicRooms.mockResolvedValue({ rooms: [{ id: "!remote", name: "Remote lounge", memberCount: 42 }], nextBatch: "next" });
  mocks.joinRoom.mockResolvedValue(true);
  const close = vi.fn(), joined = vi.fn();
  render(<JoinMatrixDialog onClose={close} onJoined={joined} />);
  fireEvent.change(screen.getByRole("textbox", { name: "Matrix server" }), { target: { value: "remote.org" } });
  fireEvent.click(screen.getByRole("button", { name: "Browse rooms" }));
  await screen.findByText("Remote lounge");
  expect(mocks.searchPublicRooms).toHaveBeenCalledWith("remote.org", "", undefined);
  fireEvent.click(screen.getByRole("button", { name: "Load more" }));
  await waitFor(() => expect(mocks.searchPublicRooms).toHaveBeenCalledWith("remote.org", "", "next"));
  await waitFor(() => expect((screen.getByRole("button", { name: "Join" }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole("button", { name: "Join" }));
  await waitFor(() => expect(close).toHaveBeenCalled());
  expect(mocks.joinRoom).toHaveBeenCalledWith("!remote", ["remote.org"]);
  expect(joined).toHaveBeenCalledWith("!remote");
});

it("joins matrix.to links without requiring directory access", async () => {
  mocks.joinRoom.mockResolvedValue(true);
  const close = vi.fn();
  render(<JoinMatrixDialog onClose={close} onJoined={vi.fn()} />);
  fireEvent.change(screen.getByRole("textbox", { name: "Room address or matrix.to link" }), { target: { value: "https://matrix.to/#/!remote?via=remote.org" } });
  fireEvent.click(screen.getByRole("button", { name: "Join room or space" }));
  await waitFor(() => expect(close).toHaveBeenCalled());
  expect(mocks.joinRoom).toHaveBeenCalledWith("!remote", ["remote.org"]);
  expect(mocks.searchPublicRooms).not.toHaveBeenCalled();
});

it("keeps the dialog open with an error if federation rejects a join", async () => {
  mocks.joinRoom.mockResolvedValue(false);
  const close = vi.fn();
  render(<JoinMatrixDialog onClose={close} onJoined={vi.fn()} />);
  fireEvent.change(screen.getByRole("textbox", { name: "Room address or matrix.to link" }), { target: { value: "#lobby:remote.org" } });
  fireEvent.click(screen.getByRole("button", { name: "Join room or space" }));
  expect((await screen.findByRole("alert")).textContent).toContain("federation");
  expect(close).not.toHaveBeenCalled();
});
