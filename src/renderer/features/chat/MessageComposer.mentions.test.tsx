// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MessageComposer } from "./MessageComposer";
import type { MatrixRoomMember } from "../../../domain/matrix/MatrixTypes";

const members: MatrixRoomMember[] = [
  { id: "@alice:example.org", displayName: "Alice", avatarUrl: null, membership: "join", isTyping: false },
  { id: "@bob:example.org", displayName: "Bob", avatarUrl: null, membership: "join", isTyping: false },
  { id: "@left:example.org", displayName: "Left", avatarUrl: null, membership: "leave", isTyping: false },
];
beforeEach(() => { HTMLElement.prototype.scrollIntoView = vi.fn(); });
afterEach(cleanup);
const show = () => { const onSend = vi.fn().mockResolvedValue(undefined); render(<MessageComposer roomName="Room" members={members} onSend={onSend} onTyping={vi.fn()} />); return onSend; };
describe("mention autocomplete", () => {
  it("selects a room member with Enter before sending", async () => {
    const send = show(); const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "Hey @Ali" } });
    expect(screen.getByRole("listbox", { name: "Room members" })).toBeTruthy();
    expect(screen.getAllByRole("option")).toHaveLength(1);
    fireEvent.keyDown(input, { key: "Enter" });
    expect((input as HTMLTextAreaElement).value).toBe("Hey @alice:example.org ");
    expect(send).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() => expect(send).toHaveBeenCalledWith("Hey @alice:example.org"));
  });
  it("supports Arrow keys and Tab and excludes people who left", () => {
    show(); const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "@" } });
    expect(screen.getAllByRole("option")).toHaveLength(2);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Tab" });
    expect((input as HTMLTextAreaElement).value).toBe("@bob:example.org ");
  });
  it("supports mouse selection and Escape dismissal", () => {
    show(); const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "@Bob" } });
    fireEvent.click(screen.getByRole("option"));
    expect((input as HTMLTextAreaElement).value).toBe("@bob:example.org ");
    fireEvent.change(input, { target: { value: "@Ali" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect((input as HTMLTextAreaElement).value).toBe("@Ali");
  });
});
