// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GifMessage } from "./GifMessage";

beforeEach(() => {
  localStorage.clear();
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("opens an animated GIF in the image viewer, supports zoom, and restores focus on Escape", () => {
  const url = "https://media.tenor.com/frog.gif";
  const open = vi.spyOn(window, "open");
  render(<GifMessage url={url} />);
  const preview = screen.getByRole("button", { name: "Open full-size GIF" });
  preview.focus(); fireEvent.click(preview);
  const viewer = screen.getByRole("dialog", { name: "Image viewer: GIF" });
  expect(viewer.querySelector("img")?.getAttribute("src")).toBe(url);
  expect(screen.queryByRole("link")).toBeNull();
  expect(open).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Zoom image" }));
  expect(viewer.querySelector<HTMLElement>(".image-viewer__image")?.style.transform).toContain("scale(2.5)");
  fireEvent(viewer, new Event("cancel", { cancelable: true }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(preview);
});

it("requires consent for external GIFs and keeps favourites separate from the viewer", () => {
  render(<GifMessage url="https://example.com/frog.gif" />);
  expect(screen.queryByRole("img")).toBeNull();
  expect(screen.queryByRole("button", { name: "Open full-size GIF" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Add GIF to favourites" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Load external GIF from example.com" }));
  fireEvent.click(screen.getByRole("button", { name: "Open full-size GIF" }));
  expect(screen.getByRole("dialog", { name: "Image viewer: GIF" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Close image viewer" }));
  expect(screen.queryByRole("dialog")).toBeNull();
});
