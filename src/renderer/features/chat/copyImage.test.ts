// @vitest-environment jsdom
import { Blob as NodeBlob } from "node:buffer";
import { afterEach, expect, it, vi } from "vitest";
import { copyImage } from "./copyImage";
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); Reflect.deleteProperty(window, "desktop"); Reflect.deleteProperty(navigator, "clipboard"); });
it("copies actual PNG bytes through the desktop bridge", async () => {
  const writeImage = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("desktop", { clipboard: { writeImage } });
  await copyImage(new NodeBlob([new Uint8Array([1, 2, 3])], { type: "image/png" }) as Blob);
  expect(writeImage).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]));
});
it("uses an image ClipboardItem in the browser and preserves write failures", async () => {
  const write = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { write } });
  vi.stubGlobal("ClipboardItem", class { constructor(public items: Record<string, Promise<Blob>>) {} });
  const blob = new NodeBlob(["image"], { type: "image/png" }) as Blob;
  await copyImage(blob);
  expect(await write.mock.calls[0][0][0].items["image/png"]).toBe(blob);
  write.mockRejectedValueOnce(new Error("Clipboard denied"));
  await expect(copyImage(blob)).rejects.toThrow("Clipboard denied");
});

it("copies with a running host that does not register the image IPC handler", async () => {
  const write = vi.fn().mockResolvedValue(undefined);
  const writeImage = vi.fn().mockRejectedValue(new Error("No handler registered for clipboard:write-image"));
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { write } });
  vi.stubGlobal("ClipboardItem", class { constructor(public items: Record<string, Promise<Blob>>) {} });
  vi.stubGlobal("desktop", { clipboard: { writeImage } });
  await copyImage(new NodeBlob(["pixels"], { type: "image/png" }) as Blob);
  expect(write).toHaveBeenCalledOnce();
  expect(writeImage).not.toHaveBeenCalled();
});
it("falls back to native image copying when browser clipboard access is denied", async () => {
  const write = vi.fn().mockRejectedValue(new Error("Permission denied"));
  const writeImage = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { write } });
  vi.stubGlobal("ClipboardItem", class { constructor(public items: Record<string, Promise<Blob>>) {} });
  vi.stubGlobal("desktop", { clipboard: { writeImage } });
  await copyImage(new NodeBlob([new Uint8Array([3, 2, 1])], { type: "image/png" }) as Blob);
  expect(writeImage).toHaveBeenCalledWith(new Uint8Array([3, 2, 1]));
});
