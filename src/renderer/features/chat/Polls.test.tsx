// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MessageComposer } from "./MessageComposer";
import { PollMessage } from "./PollMessage";
import type { MatrixMessage } from "../../../domain/matrix/MatrixTypes";
import type { PollSnapshot } from "../../../domain/messaging/Polls";
const mocks = vi.hoisted(() => ({ observePoll: vi.fn(), votePoll: vi.fn(async () => {}), endPoll: vi.fn(async () => {}) }));
vi.mock("../../app/providers/MatrixProvider", () => ({ useMatrixRuntime: () => mocks }));
const definition = { question: "Lunch?", answers: [{ id: "a", text: "Pizza" }, { id: "b", text: "Pasta" }], maxSelections: 1, disclosed: true };
const message: MatrixMessage = { id: "$poll", roomId: "!room", sender: { id: "@me", displayName: "Me", avatarUrl: null }, timestamp: 1, type: "poll", body: "Lunch?", poll: definition, edited: false, replyTo: null, reactions: [], sendState: "sent", isOwn: true, isRedacted: false };
const base: PollSnapshot = { counts: { a: 0, b: 0 }, totalVoters: 0, ownAnswers: [], ended: false, canEnd: true, loading: false, incomplete: false };
beforeEach(() => {
  vi.clearAllMocks();
  HTMLDialogElement.prototype.showModal = vi.fn(function(this: HTMLDialogElement) { this.setAttribute("open", ""); });
  HTMLDialogElement.prototype.close = vi.fn(function(this: HTMLDialogElement) { this.removeAttribute("open"); });
  mocks.observePoll.mockImplementation((_room: string, _id: string, listener: (value: PollSnapshot) => void) => { listener(base); return () => {}; });
});
afterEach(cleanup);
it("creates a poll through the plus menu without sending the existing message draft", async () => {
  const sendPoll = vi.fn(async () => {}), sendText = vi.fn(async () => {});
  render(<MessageComposer roomName="Room" onSend={sendText} onTyping={vi.fn()} onSendPoll={sendPoll} onSendAttachment={vi.fn()} />);
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "Keep my draft" } });
  fireEvent.click(screen.getByRole("button", { name: "Add attachment or poll" }));
  fireEvent.click(screen.getByRole("button", { name: "Create poll" }));
  fireEvent.change(screen.getByLabelText("Question"), { target: { value: "Lunch?" } });
  fireEvent.change(screen.getByLabelText("Answer 1"), { target: { value: "Pizza" } });
  fireEvent.change(screen.getByLabelText("Answer 2"), { target: { value: "Pasta" } });
  fireEvent.click(screen.getByLabelText("Hide results until poll ends"));
  fireEvent.click(screen.getByRole("button", { name: "Send poll" }));
  await waitFor(() => expect(sendPoll).toHaveBeenCalledWith({ question: "Lunch?", answers: ["Pizza", "Pasta"], maxSelections: 1, disclosed: false }));
  expect(sendText).not.toHaveBeenCalled(); expect((screen.getByRole("combobox") as HTMLTextAreaElement).value).toBe("Keep my draft");
});
it("retains poll input after a send failure and keeps attachment selection accessible", async () => {
  render(<MessageComposer roomName="Room" onSend={vi.fn()} onTyping={vi.fn()} onSendPoll={vi.fn().mockRejectedValue(new Error("Offline"))} onSendAttachment={vi.fn()} />);
  const fileClick = vi.spyOn(screen.getByLabelText("Choose files to attach"), "click");
  fireEvent.click(screen.getByRole("button", { name: "Add attachment or poll" })); fireEvent.click(screen.getByRole("button", { name: "Attach files" })); expect(fileClick).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "Add attachment or poll" })); fireEvent.click(screen.getByRole("button", { name: "Create poll" }));
  fireEvent.change(screen.getByLabelText("Question"), { target: { value: "Lunch?" } });
  fireEvent.change(screen.getByLabelText("Answer 1"), { target: { value: "Pizza" } });
  fireEvent.change(screen.getByLabelText("Answer 2"), { target: { value: "Pasta" } });
  fireEvent.click(screen.getByRole("button", { name: "Send poll" }));
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Offline"); expect((screen.getByLabelText("Question") as HTMLInputElement).value).toBe("Lunch?");
});
it("submits votes and allows the creator to end the poll", async () => {
  render(<PollMessage message={message} />);
  fireEvent.click(screen.getByRole("radio", { name: /Pizza/ })); fireEvent.click(screen.getByRole("button", { name: "Vote" }));
  await waitFor(() => expect(mocks.votePoll).toHaveBeenCalledWith("!room", "$poll", ["a"]));
  await waitFor(() => expect((screen.getByRole("button", { name: "End poll" }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole("button", { name: "End poll" })); await waitFor(() => expect(mocks.endPoll).toHaveBeenCalledWith("!room", "$poll"));
});
it("hides undisclosed counts until closure, disables closed polls and respects permissions", () => {
  mocks.observePoll.mockImplementation((_room: string, _id: string, listener: (value: PollSnapshot) => void) => { listener({ ...base, canEnd: false, counts: { a: 2, b: 0 }, totalVoters: 2 }); return () => {}; });
  const view = render(<PollMessage message={{ ...message, poll: { ...definition, disclosed: false } }} />);
  expect(screen.queryByText("2 voters")).toBeNull(); expect(screen.queryByRole("button", { name: "End poll" })).toBeNull();
  // Re-render with a closed snapshot through a fresh observer.
  view.unmount();
  mocks.observePoll.mockImplementation((_room: string, _id: string, listener: (value: PollSnapshot) => void) => { listener({ ...base, ended: true, counts: { a: 2, b: 0 }, totalVoters: 2 }); return () => {}; });
  render(<PollMessage message={{ ...message, poll: { ...definition, disclosed: false } }} />);
  expect(screen.getByText("2 voters")).toBeTruthy(); expect(screen.queryByRole("button", { name: "Vote" })).toBeNull(); expect((screen.getByRole("radio", { name: /Pizza/ }) as HTMLInputElement).disabled).toBe(true);
});
