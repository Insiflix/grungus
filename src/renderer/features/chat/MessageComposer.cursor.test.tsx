// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MessageComposer } from "./MessageComposer";
import { roomDrafts } from "./RoomDrafts";
afterEach(cleanup);
const props = { roomName: "Room", onSend: vi.fn().mockResolvedValue(undefined), onTyping: vi.fn() };
it("restores a draft's exact selection after switching rooms", async () => {
  const key = "cursor-test/room-one";
  roomDrafts.patch(key, { body: "Text with a draft", hydrated: true });
  const view = render(<MessageComposer key="one" {...props} draftKey={key} />);
  const input = screen.getByRole("combobox") as HTMLTextAreaElement;
  input.focus(); input.setSelectionRange(5, 9, "backward"); fireEvent.select(input);
  expect(roomDrafts.get(key).selection).toEqual({ start: 5, end: 9, direction: "backward" });
  view.rerender(<MessageComposer key="two" {...props} draftKey="cursor-test/room-two" />);
  view.rerender(<MessageComposer key="one-again" {...props} draftKey={key} />);
  const restored = screen.getByRole("combobox") as HTMLTextAreaElement;
  await waitFor(() => expect(restored.selectionStart).toBe(5));
  expect(restored.selectionEnd).toBe(9); expect(restored.selectionDirection).toBe("backward");
  expect(document.activeElement).toBe(restored);
  restored.setSelectionRange(2, 2); fireEvent.select(restored);
  fireEvent.change(restored, { target: { value: "TeXxt with a draft", selectionStart: 3, selectionEnd: 3 } });
  expect(restored.selectionStart).toBe(3);
});
it("places the caret at the end when restoring older drafts without selection data", async () => {
  const key = "cursor-test/old";
  const view = render(<MessageComposer {...props} draftKey={key} />);
  act(() => roomDrafts.patch(key, { body: "Restored asynchronously", hydrated: true }));
  const input = screen.getByRole("combobox") as HTMLTextAreaElement;
  await waitFor(() => expect(input.selectionStart).toBe("Restored asynchronously".length));
  expect(input.selectionEnd).toBe(input.value.length);
  view.unmount();
});
