// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { MatrixMessage } from "../../../domain/matrix/MatrixTypes";
import { MessageComposer } from "./MessageComposer";
import { PendingMessageError } from "../../../domain/messaging/PendingMessageError";
afterEach(cleanup);
const message: MatrixMessage = {
  id: "$message", roomId: "!room:example", sender: { id: "@me:example", displayName: "Me", avatarUrl: null },
  timestamp: 1, type: "text", body: "Original", edited: false, replyTo: null, reactions: [], sendState: "sent", isOwn: true, isRedacted: false,
};
describe("composer message actions", () => {
  it("does not restore a duplicate text draft when Matrix already owns the failed send", async () => {
    const send = vi.fn().mockRejectedValue(new PendingMessageError("Offline", "~pending"));
    render(<MessageComposer roomName="Room" onSend={send} onTyping={vi.fn()} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "Send once" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await screen.findByRole("alert");
    expect((screen.getByRole("combobox") as HTMLTextAreaElement).value).toBe("");
    expect(screen.queryByRole("button", { name: "Retry send" })).toBeNull();
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("prefills edits and restores the draft on cancel", () => {
    const props = { roomName: "Room", onSend: vi.fn(), onTyping: vi.fn() };
    const view = render(<MessageComposer {...props} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "My draft" } });
    view.rerender(<MessageComposer {...props} editing={message} />);
    expect((screen.getByRole("combobox") as HTMLTextAreaElement).value).toBe("Original");
    view.rerender(<MessageComposer {...props} />);
    expect((screen.getByRole("combobox") as HTMLTextAreaElement).value).toBe("My draft");
  });
  it("restores an empty draft on cancel", () => {
    const props = { roomName: "Room", onSend: vi.fn(), onTyping: vi.fn() };
    const view = render(<MessageComposer {...props} editing={message} />);
    view.rerender(<MessageComposer {...props} />);
    expect((screen.getByRole("combobox") as HTMLTextAreaElement).value).toBe("");
  });
  it("preserves the edited text after a send failure", async () => {
    render(<MessageComposer roomName="Room" onSend={vi.fn().mockRejectedValue(new Error("Offline"))} onTyping={vi.fn()} editing={message} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "Revised" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() => expect((screen.getByRole("combobox") as HTMLTextAreaElement).value).toBe("Revised"));
  });
});
