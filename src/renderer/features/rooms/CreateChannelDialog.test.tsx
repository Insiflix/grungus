// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CreateChannelDialog } from "./CreateChannelDialog";
import type { MatrixRoom } from "../../../domain/matrix/MatrixTypes";

const mocks = vi.hoisted(() => ({ createSpaceChannel: vi.fn().mockResolvedValue("!new:test") }));
vi.mock("../../app/providers/MatrixProvider", () => ({ matrixSettings: mocks }));
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it("submits public access when anyone can join is selected during voice channel creation", async () => {
  const onCreated = vi.fn();
  render(<CreateChannelDialog space={{ id: "!server:test", name: "Server" } as MatrixRoom} onClose={vi.fn()} onCreated={onCreated} />);
  fireEvent.click(screen.getByRole("radio", { name: /Voice/ }));
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Garle Girk" } });
  fireEvent.click(screen.getByRole("combobox"));
  fireEvent.click(screen.getByRole("option", { name: "Public (anyone can join)" }));
  fireEvent.click(screen.getByRole("button", { name: "Create channel" }));
  await waitFor(() => expect(mocks.createSpaceChannel).toHaveBeenCalledWith("!server:test", "Garle Girk", true, "public"));
  expect(onCreated).toHaveBeenCalledOnce();
});
