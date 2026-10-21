import { StrictMode } from "react";
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AttachmentMessage } from "./AttachmentMessage";
import { AttachmentMediaContext } from "../../components/common/AttachmentMediaContext";
const codec = vi.hoisted(() => ({ load: vi.fn(), writeFile: vi.fn(), exec: vi.fn(async () => 0), readFile: vi.fn(async () => new Uint8Array([1, 2, 3])), terminate: vi.fn() }));
vi.mock("@ffmpeg/ffmpeg", () => ({ FFmpeg: class { load = codec.load; writeFile = codec.writeFile; exec = codec.exec; readFile = codec.readFile; terminate = codec.terminate; } }));

const attachment = { name: "photo.png", url: "mxc://example/photo", mimeType: "image/png", size: 2048 };
beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  URL.createObjectURL = vi.fn(() => "blob:media"); URL.revokeObjectURL = vi.fn(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); Reflect.deleteProperty(window, "desktop"); });

describe("received attachments", () => {
  it.each([["clip.webm", "video/webm", "video"], ["clip.mp4", "video/mp4", "video"], ["song.mp3", "audio/mpeg", "audio"], ["song.wav", "audio/wav", "audio"]])("loads %s on demand with custom controls and cleans up media URLs", async (name, mimeType, tag) => {
    const load = vi.fn().mockResolvedValue(new Blob(["media"], { type: mimeType }));
    const view = render(<AttachmentMediaContext.Provider value={load}><AttachmentMessage attachment={{ name, mimeType, url: "mxc://example/media" }} inline /></AttachmentMediaContext.Provider>);
    expect(load).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: `Play ${tag}` }));
    await waitFor(() => expect(view.container.querySelector(tag)?.getAttribute("src")).toBe("blob:media"));
    expect(view.container.querySelector(tag)?.hasAttribute("controls")).toBe(false);
    expect(screen.getByRole("button", { name: `Download ${name}` })).toBeTruthy();
    expect(screen.getByRole("slider", { name: `Seek ${name}` })).toBeTruthy();
    expect(view.container.querySelector(".message-attachment__details")).toBeNull();
    view.unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:media");
  });
  it("converts unsupported codecs locally while downloading the original encrypted attachment", async () => {
    vi.spyOn(HTMLMediaElement.prototype, "canPlayType").mockReturnValue("");
    const bytes = new Uint8Array([1, 2, 3]);
    const blob = { type: "video/mpeg", size: 3, arrayBuffer: async () => bytes.buffer } as Blob;
    vi.stubGlobal("Worker", class {});
    const load = vi.fn().mockResolvedValue(blob);
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const file = { name: "private.mpg", mimeType: "video/mpeg", url: "mxc://example/private", encrypted: { url: "mxc://example/private", key: { alg: "A256CTR", key_ops: ["decrypt"], kty: "oct", k: "secret", ext: true }, iv: "iv", hashes: {}, v: "v2" } };
    const view = render(<AttachmentMediaContext.Provider value={load}><AttachmentMessage attachment={file} inline /></AttachmentMediaContext.Provider>);
    fireEvent.click(screen.getByRole("button", { name: "Play video" }));
    await waitFor(() => expect(view.container.querySelector("video")).toBeTruthy());
    expect(codec.writeFile).toHaveBeenCalledWith("input.media", bytes, expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(codec.terminate).toHaveBeenCalled();
    expect(load).toHaveBeenCalledWith(file, expect.any(AbortSignal));
    fireEvent.click(screen.getByRole("button", { name: "Download private.mpg" }));
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenLastCalledWith(blob));
    expect(load).toHaveBeenCalledOnce();
  });
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

it("loads an encrypted Matrix poster without downloading the video and releases it on unmount", async () => {
  const encrypted = { url: "mxc://example/poster", key: { alg: "A256CTR", key_ops: ["decrypt"], kty: "oct", k: "secret", ext: true }, iv: "iv", hashes: {}, v: "v2" };
  const file = { name: "private.mp4", mimeType: "video/mp4", url: "mxc://example/video", size: 99_000_000, thumbnail: { url: encrypted.url, mimeType: "image/jpeg", encrypted } };
  const load = vi.fn().mockResolvedValue(new Blob(["poster"], { type: "image/jpeg" }));
  const view = render(<AttachmentMediaContext.Provider value={load}><AttachmentMessage attachment={file} inline /></AttachmentMediaContext.Provider>);
  expect(await screen.findByAltText("Preview of private.mp4")).toBeTruthy();
  expect(load).toHaveBeenCalledOnce(); expect(load).toHaveBeenCalledWith(expect.objectContaining({ url: encrypted.url, encrypted }), expect.any(AbortSignal));
  expect(view.container.querySelector("video")).toBeNull();
  view.unmount(); expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:media");
});
it("does not download a large original just to show its embed", async () => {
  const load = vi.fn(); render(<AttachmentMediaContext.Provider value={load}><AttachmentMessage attachment={{ name: "large.mp4", mimeType: "video/mp4", url: "mxc://example/large", size: 100_000_000 }} inline /></AttachmentMediaContext.Provider>);
  expect(screen.getByRole("button", { name: "Load preview" })).toBeTruthy();
  expect(load).not.toHaveBeenCalled();
});
it("supports custom audio seeking, mute, volume and speed in StrictMode", async () => {
  const file = { name: "music.mp3", mimeType: "audio/mpeg", url: "mxc://example/music", durationMs: 90_000 };
  const load = vi.fn().mockResolvedValue(new Blob(["audio"], { type: "audio/mpeg" }));
  const view = render(<StrictMode><AttachmentMediaContext.Provider value={load}><AttachmentMessage attachment={file} inline /></AttachmentMediaContext.Provider></StrictMode>);
  fireEvent.click(screen.getByRole("button", { name: "Play audio" }));
  await waitFor(() => expect(view.container.querySelector("audio")?.src).toBe("blob:media"));
  const audio = view.container.querySelector("audio")!;
  Object.defineProperty(audio, "duration", { value: 90 }); fireEvent.loadedMetadata(audio);
  fireEvent.change(screen.getByRole("slider", { name: "Seek music.mp3" }), { target: { value: "25" } }); expect(audio.currentTime).toBe(25);
  fireEvent.click(screen.getByRole("button", { name: "Mute music.mp3" })); expect(audio.muted).toBe(true);
  fireEvent.change(screen.getByRole("slider", { name: "Volume music.mp3" }), { target: { value: ".4" } }); expect(audio.volume).toBe(.4); expect(audio.muted).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Playback speed 1x" })); expect(audio.playbackRate).toBe(1.25);
  expect((load.mock.calls[0][1] as AbortSignal).aborted).toBe(false);
  expect(view.container.querySelector(".message-attachment__details")).toBeNull();
});
it("keeps a usable play button when autoplay is blocked", async () => {
  vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValue(new DOMException("Blocked", "NotAllowedError"));
  const view = render(<AttachmentMediaContext.Provider value={vi.fn().mockResolvedValue(new Blob(["video"], { type: "video/mp4" }))}><AttachmentMessage attachment={{ name: "clip.mp4", url: "mxc://example/video", mimeType: "video/mp4" }} inline /></AttachmentMediaContext.Provider>);
  fireEvent.click(screen.getByRole("button", { name: "Play video" })); await waitFor(() => expect(view.container.querySelector("video")).toBeTruthy());
  expect(screen.getByRole("button", { name: "Play video" })).toBeTruthy(); expect(screen.queryByRole("alert")).toBeNull();
});
