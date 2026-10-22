// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GifMessage } from "./GifMessage";
import { GifPicker } from "./GifPicker";

const mocks = vi.hoisted(() => ({ key: "key", search: vi.fn(), share: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../../infrastructure/gifs/KlipyClient", () => ({
  KlipyClient: class { search = mocks.search; registerShare = mocks.share; },
  readKlipyKey: () => mocks.key, hasDefaultKlipyKey: () => true, saveKlipyKey: vi.fn(),
}));
const gif = { id: "frog", title: "Frog", url: "https://example.com/frog.gif", previewUrl: "https://example.com/preview.gif", width: 160, height: 120 };
beforeEach(() => {
  localStorage.clear(); mocks.key = "key";
  mocks.search.mockReset().mockResolvedValue({ results: [gif], next: null });
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
afterEach(cleanup);

describe("GIF favourites", () => {
  it("saves a chat GIF, shares state across instances, and persists after remount", () => {
    const first = render(<><GifMessage url={gif.url} /><GifMessage url={gif.url} /></>);
    fireEvent.click(screen.getAllByRole("button", { name: "Add GIF to favourites" })[0]);
    expect(screen.getAllByRole("button", { name: "Remove GIF from favourites" })).toHaveLength(2);
    expect(JSON.parse(localStorage.getItem("grungus.gif-favorites")!)).toHaveLength(1);
    first.unmount();
    render(<GifMessage url={gif.url} />);
    expect(screen.getByRole("button", { name: "Remove GIF from favourites" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove GIF from favourites" }));
    expect(JSON.parse(localStorage.getItem("grungus.gif-favorites")!)).toEqual([]);
  });
  it("offers keyboard accessible right-click actions without opening the parent message menu", () => {
    const parent = vi.fn();
    render(<div onContextMenu={parent}><GifMessage url={gif.url} /></div>);
    expect(screen.queryByRole("img")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Load external GIF from example.com" }));
    fireEvent.contextMenu(screen.getByAltText("Geteiltes GIF"), { clientX: 100, clientY: 100 });
    expect(parent).not.toHaveBeenCalled();
    const add = screen.getByRole("menuitem", { name: "Add GIF to favourites" });
    expect(document.activeElement).toBe(add);
    fireEvent.keyDown(add, { key: "ArrowDown" });
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Open GIF" }));
    fireEvent.click(add);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.getByRole("button", { name: "Remove GIF from favourites" })).toBeTruthy();
  });
  it("favourites picker results without sending and sends from its own tab", async () => {
    const send = vi.fn().mockResolvedValue(undefined), close = vi.fn();
    render(<GifPicker onSend={send} onClose={close} />);
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "Add GIF to favourites" }));
    expect(send).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("tab", { name: "Favourites" }));
    expect(screen.getByRole("tab", { name: "Favourites" }).getAttribute("aria-selected")).toBe("true");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Send Frog" })); });
    expect(send).toHaveBeenCalledWith(gif.url);
    expect(close).toHaveBeenCalledOnce();
  });
  it("can send saved chat GIFs without an API key", async () => {
    mocks.key = "";
    const first = render(<GifMessage url={gif.url} />);
    fireEvent.click(screen.getByRole("button", { name: "Add GIF to favourites" }));
    first.unmount();
    const send = vi.fn().mockResolvedValue(undefined);
    render(<GifPicker onSend={send} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("tab", { name: "Favourites" }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Send GIF" })); });
    expect(send).toHaveBeenCalledWith(gif.url);
    expect(mocks.search).not.toHaveBeenCalled();
  });
  it("rejects corrupt or unsafe stored entries", () => {
    localStorage.setItem("grungus.gif-favorites", JSON.stringify([{ ...gif, url: "javascript:alert(1)" }, null, {}]));
    render(<GifMessage url={gif.url} />);
    expect(screen.getByRole("button", { name: "Add GIF to favourites" })).toBeTruthy();
  });
});
