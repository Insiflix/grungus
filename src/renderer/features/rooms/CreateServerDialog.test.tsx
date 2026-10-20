// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CreateServerDialog } from "./CreateServerDialog";
const mocks = vi.hoisted(() => ({ createRoom: vi.fn(async () => "!new-server"), joinRoom: vi.fn(async () => true) }));
vi.mock("../../app/providers/MatrixProvider", () => ({ matrixSettings: { createRoom: mocks.createRoom }, useMatrixRuntime: () => ({ joinRoom: mocks.joinRoom }) }));
HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe("create server", () => {
  it("creates a space for the current user and opens it", async () => {
    const onCreated = vi.fn();
    render(<CreateServerDialog onCreated={onCreated} onClose={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Server name" }), { target: { value: "My server" } });
    fireEvent.click(screen.getByRole("button", { name: "Create server" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith("!new-server"));
    expect(mocks.createRoom).toHaveBeenCalledWith("My server", true, false, false);
    expect(mocks.joinRoom).toHaveBeenCalledWith("!new-server");
  });
  it("retries opening an already-created server without creating duplicates", async () => {
    mocks.joinRoom.mockResolvedValueOnce(false);
    const onCreated = vi.fn();
    render(<CreateServerDialog onCreated={onCreated} onClose={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Server name" }), { target: { value: "My server" } });
    fireEvent.click(screen.getByRole("button", { name: "Create server" }));
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Open server" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(mocks.createRoom).toHaveBeenCalledOnce();
    expect(mocks.joinRoom).toHaveBeenCalledTimes(2);
  });
});
