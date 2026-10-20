// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AttachmentMessage } from "./AttachmentMessage";
import { AttachmentMediaContext } from "../../components/common/AttachmentMediaContext";

const attachment = { name: "photo.png", url: "mxc://example/photo", mimeType: "image/png", size: 2048 };
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  URL.createObjectURL = vi.fn(() => "blob:media"); URL.revokeObjectURL = vi.fn(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("received attachments", () => {
  it("shows image-only thumbnails, opens the viewer on click, and restores focus after closing", async () => {
    const load = vi.fn().mockResolvedValue(new Blob(["image"], { type: "image/png" }));
    render(<AttachmentMediaContext.Provider value={load}><AttachmentMessage attachment={attachment} inline /></AttachmentMediaContext.Provider>);
    const thumbnail = await screen.findByRole("button", { name: "View photo.png" });
    expect(screen.queryByText("photo.png")).toBeNull();
    expect(screen.queryByText("2.0 KB")).toBeNull();
    expect(screen.queryByRole("button", { name: "Download photo.png" })).toBeNull();
    thumbnail.focus(); fireEvent.click(thumbnail);
    expect(screen.getByRole("dialog", { name: "Image viewer: photo.png" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Zoom image" }));
    expect(screen.getAllByRole("button", { name: "Fit image to window" }).length).toBe(2);
    const imageButton = screen.getByRole("dialog").querySelector<HTMLButtonElement>(".image-viewer__image")!;
    expect(imageButton.style.transform).toContain("scale(2.5)");
    fireEvent.click(imageButton);
    expect(imageButton.style.transform).toContain("scale(1)");
    fireEvent.click(imageButton);
    expect(imageButton.style.transform).toContain("scale(2.5)");
    fireEvent.click(screen.getByRole("button", { name: "Close image viewer" }));
    expect(screen.queryByRole("dialog")).toBeNull(); expect(document.activeElement).toBe(thumbnail);
    fireEvent.click(thumbnail); fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("offers download on right-click without opening the message context menu", async () => {
    const load = vi.fn().mockResolvedValue(new Blob(["image"]));
    const parentMenu = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    render(<div onContextMenu={parentMenu}><AttachmentMediaContext.Provider value={load}><AttachmentMessage attachment={attachment} inline /></AttachmentMediaContext.Provider></div>);
    fireEvent.contextMenu(await screen.findByRole("button", { name: "View photo.png" }), { clientX: 30, clientY: 40 });
    expect(parentMenu).not.toHaveBeenCalled();
    expect(screen.getByRole("menu", { name: "Image actions" })).toBeTruthy();
    fireEvent.click(screen.getByRole("menuitem", { name: "Download image" }));
    await waitFor(() => expect(click).toHaveBeenCalledOnce());
    expect(screen.queryByRole("menu")).toBeNull();
    expect(load).toHaveBeenCalledOnce();
  });
  it("loads an image through the media provider and releases its URL on unmount", async () => {
    const load = vi.fn().mockResolvedValue(new Blob(["image"], { type: "image/png" }));
    const onLoad = vi.fn();
    const view = render(<AttachmentMediaContext.Provider value={load}><AttachmentMessage attachment={attachment} inline onLoad={onLoad} /></AttachmentMediaContext.Provider>);
    const image = await screen.findByAltText("photo.png");
    expect(image.getAttribute("src")).toBe("blob:media");
    fireEvent.load(image); expect(onLoad).toHaveBeenCalledOnce();
    // Timeline remapping must not download an unchanged image again.
    view.rerender(<AttachmentMediaContext.Provider value={load}><AttachmentMessage attachment={{ ...attachment }} inline onLoad={onLoad} /></AttachmentMediaContext.Provider>);
    expect(load).toHaveBeenCalledTimes(1);
    view.unmount(); expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:media");
    expect((load.mock.calls[0][1] as AbortSignal).aborted).toBe(true);
  });
  it("respects disabled inline media and downloads only when requested", async () => {
    const load = vi.fn().mockResolvedValue(new Blob(["file"]));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    render(<AttachmentMediaContext.Provider value={load}><AttachmentMessage attachment={attachment} inline={false} /></AttachmentMediaContext.Provider>);
    expect(load).not.toHaveBeenCalled();
    expect(screen.queryByRole("img")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Download photo.png" }));
    await waitFor(() => expect(click).toHaveBeenCalledOnce());
    expect(load).toHaveBeenCalledWith(attachment);
  });
});
