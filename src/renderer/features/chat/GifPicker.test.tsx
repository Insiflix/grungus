// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GifPicker } from "./GifPicker";
import { GifPageCache } from "./GifPageCache";

const mocks = vi.hoisted(() => ({ search: vi.fn(), key: "" }));
vi.mock("../../../infrastructure/gifs/KlipyClient", () => ({
  KlipyClient: class { search = mocks.search; registerShare = vi.fn().mockResolvedValue(undefined); },
  readKlipyKey: () => mocks.key, hasDefaultKlipyKey: () => true, saveKlipyKey: vi.fn(),
}));
const gif = (id: string) => ({ id, title: id, url: `https://example.com/${id}.gif`, previewUrl: `https://example.com/${id}-tiny.gif`, width: 160, height: 120 });
const page = (id: string) => ({ results: [gif(id)], next: null });
const open = () => render(<GifPicker onSend={vi.fn().mockResolvedValue(undefined)} onClose={vi.fn()} />);

beforeEach(() => {
  vi.useFakeTimers();
  mocks.key = crypto.randomUUID();
  mocks.search.mockReset().mockResolvedValue(page("trending"));
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("GIF picker responsiveness", () => {
  it("dismisses clicks outside the dialog while keeping clicks inside open", async () => {
    const close = vi.fn();
    render(<GifPicker onSend={vi.fn().mockResolvedValue(undefined)} onClose={close} />);
    await act(async () => {});
    const dialog = screen.getByRole("dialog");
    vi.spyOn(dialog, "getBoundingClientRect").mockReturnValue({ left: 100, top: 100, right: 580, bottom: 600 } as DOMRect);
    fireEvent.click(dialog, { clientX: 120, clientY: 150 });
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(dialog, { clientX: 20, clientY: 50 });
    expect(close).toHaveBeenCalledOnce();
  });
  it("starts trending immediately and reopens with cached results without a timer or request", async () => {
    const first = open();
    expect(mocks.search).toHaveBeenCalledTimes(1);
    await act(async () => {});
    expect(screen.getByRole("button", { name: "Send trending" })).toBeTruthy();
    expect(screen.getByAltText("trending").getAttribute("loading")).toBe("eager");
    first.unmount();
    open();
    expect(screen.getByRole("button", { name: "Send trending" })).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
    expect(mocks.search).toHaveBeenCalledTimes(1);
  });

  it("starts the latest typed search within 150ms, retains previews, and instantly restores cached searches", async () => {
    open();
    await act(async () => {});
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "fro" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    fireEvent.change(input, { target: { value: "frog" } });
    expect(screen.getByAltText("trending")).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(149); });
    expect(mocks.search).toHaveBeenCalledTimes(1);
    mocks.search.mockResolvedValueOnce(page("frog"));
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(mocks.search).toHaveBeenLastCalledWith("frog", undefined, expect.any(AbortSignal));
    expect(screen.getByRole("button", { name: "Send frog" })).toBeTruthy();
    fireEvent.change(input, { target: { value: "" } });
    expect(screen.getByAltText("trending")).toBeTruthy();
    fireEvent.change(input, { target: { value: "frog" } });
    expect(screen.getByAltText("frog")).toBeTruthy();
    expect(mocks.search).toHaveBeenCalledTimes(2);
  });

  it("ignores a late response from a cancelled search", async () => {
    let resolveOld!: (value: ReturnType<typeof page>) => void;
    mocks.search.mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve; }));
    open();
    const signal = mocks.search.mock.calls[0][2] as AbortSignal;
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "new" } });
    expect(signal.aborted).toBe(true);
    mocks.search.mockResolvedValueOnce(page("new"));
    await act(async () => { await vi.advanceTimersByTimeAsync(150); });
    await act(async () => { resolveOld(page("old")); });
    expect(screen.getByAltText("new")).toBeTruthy();
    expect(screen.queryByAltText("old")).toBeNull();
  });

  it("expires cached pages and keeps API keys isolated", () => {
    const cache = new GifPageCache();
    cache.set("one", "frog", page("frog"));
    expect(cache.get("two", "frog")).toBeUndefined();
    expect(cache.get("one", " frog ")).toEqual(page("frog"));
    vi.advanceTimersByTime(5 * 60_000);
    expect(cache.get("one", "frog")).toBeUndefined();
  });
});
