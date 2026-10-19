// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MessageContextMenu } from "./MessageContextMenu";
import type { MatrixMessage } from "../../../domain/matrix/MatrixTypes";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const message: MatrixMessage = {
  id: "$message", roomId: "!room:example", sender: { id: "@me:example", displayName: "Me", avatarUrl: null },
  timestamp: 1, type: "text", body: "Hello", edited: false, replyTo: null, reactions: [], sendState: "sent", isOwn: true, isRedacted: false, canPin: true,
};
function show(changes: Partial<MatrixMessage> = {}, onAction = vi.fn()) {
  const props = { message: { ...message, ...changes }, position: { x: 20, y: 20 }, onClose: vi.fn(), onReact: vi.fn(), onEmoji: vi.fn(), onAction };
  render(<MessageContextMenu {...props} />);
  return props;
}
describe("message context menu", () => {
  it("copies through the desktop bridge even when browser clipboard access is denied", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("desktop", { clipboard: { writeText } });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error("Write permission denied")) } });
    show(); fireEvent.click(screen.getByRole("menuitem", { name: "Copy text" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("Hello"));
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
  });
  it("offers quick reactions and full emoji selection", async () => {
    const props = show();
    fireEvent.click(screen.getByRole("menuitem", { name: "React with 👍" }));
    await waitFor(() => expect(props.onReact).toHaveBeenCalledWith("👍"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Choose reaction emoji" }));
    expect(props.onEmoji).toHaveBeenCalled();
  });
  it("shows ownership and pin permissions", () => {
    show({ isOwn: false, canPin: false });
    expect(screen.queryByRole("menuitem", { name: "Edit message" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Delete message" })).toBeNull();
    expect((screen.getByRole("menuitem", { name: "Pin message" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it.each([["Reply", "reply"], ["Edit message", "edit"], ["Delete message", "delete"], ["Pin message", "pin"]])("executes %s", async (label, action) => {
    const props = show();
    fireEvent.click(screen.getByRole("menuitem", { name: label }));
    await waitFor(() => expect(props.onAction).toHaveBeenCalledWith(action));
    expect(props.onClose).toHaveBeenCalled();
  });
  it("copies the original message text", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    show(); fireEvent.click(screen.getByRole("menuitem", { name: "Copy text" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("Hello"));
  });
  it("keeps failures visible and allows retry", async () => {
    const props = show({}, vi.fn().mockRejectedValue(new Error("Permission denied")));
    fireEvent.click(screen.getByRole("menuitem", { name: "Pin message" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Permission denied");
    expect(props.onClose).not.toHaveBeenCalled();
  });
  it("supports keyboard navigation, Escape, and outside dismissal", () => {
    const props = show(); const menu = screen.getByRole("menu");
    fireEvent.keyDown(menu, { key: "End" });
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Delete message" }));
    fireEvent.keyDown(menu, { key: "Escape" });
    expect(props.onClose).toHaveBeenCalledOnce();
    fireEvent.pointerDown(document.body);
    expect(props.onClose).toHaveBeenCalledTimes(2);
  });
});
