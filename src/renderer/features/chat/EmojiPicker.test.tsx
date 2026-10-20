// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EmojiPicker } from "./EmojiPicker";
import { getEmoji, nativeEmoji } from "../../../domain/messaging/Emojis";

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("emoji tab interactions", () => {
  it("dismisses backdrop clicks but keeps inside clicks and drags open", () => {
    const close = vi.fn();
    render(<EmojiPicker onPick={vi.fn()} onClose={close} />);
    const dialog = screen.getByRole("dialog") as HTMLDialogElement;
    vi.spyOn(dialog, "getBoundingClientRect").mockReturnValue({ left: 100, right: 490, top: 100, bottom: 500 } as DOMRect);
    // jsdom has no PointerEvent constructor; MouseEvent supplies pointer coordinates.
    const pointerDown = (x: number, y: number) => fireEvent(dialog, new MouseEvent("pointerdown", { bubbles: true, clientX: x, clientY: y }));
    pointerDown(110, 110);
    fireEvent.click(dialog, { clientX: 110, clientY: 110 });
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("textbox"));
    expect(close).not.toHaveBeenCalled();
    pointerDown(110, 110);
    fireEvent.click(dialog, { clientX: 10, clientY: 10 });
    expect(close).not.toHaveBeenCalled();
    pointerDown(10, 10);
    fireEvent.click(dialog, { clientX: 10, clientY: 10 });
    expect(close).toHaveBeenCalledOnce();
  });

  it("switches synchronously without remounting the viewport and resets a scrolled category", () => {
    const view = render(<EmojiPicker onPick={vi.fn()} onClose={vi.fn()} />);
    const viewport = view.container.querySelector(".emoji-picker__scroll")!;
    fireEvent.click(screen.getByRole("button", { name: "Smileys & Menschen" }));
    fireEvent.scroll(viewport, { target: { scrollTop: 800 } });
    fireEvent.click(screen.getByRole("button", { name: "Tiere & Natur" }));
    expect(view.container.querySelector(".emoji-picker__scroll")).toBe(viewport);
    expect(viewport.scrollTop).toBe(0);
    expect(view.container.querySelector(".gif-picker__section")?.textContent).toBe("Tiere & Natur");
    expect(view.container.querySelectorAll(".emoji-grid button").length).toBeLessThanOrEqual(88);
  });

  it("keeps sprite buttons accessible and inserts the selected Unicode skin tone", () => {
    const pick = vi.fn();
    const close = vi.fn();
    const view = render(<EmojiPicker onPick={pick} onClose={close} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "wave" } });
    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(screen.getAllByRole("option").at(-1)!);
    const button = view.container.querySelector<HTMLButtonElement>('button[data-tooltip=":wave:"]')!;
    expect(button.getAttribute("aria-label")).toContain(":wave:");
    expect(button.querySelector(".emoji-glyph")).toBeTruthy();
    fireEvent.click(button);
    expect(pick).toHaveBeenCalledWith(nativeEmoji(getEmoji("wave")!, 5));
    expect(close).toHaveBeenCalledOnce();
  });
});
