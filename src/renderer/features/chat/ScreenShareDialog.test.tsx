// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ScreenShareRequest } from "../../../../electron/shared/session";
import { ScreenShareDialogHost } from "./ScreenShareDialog";

const mediaDevices = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");
afterEach(() => { cleanup(); Reflect.deleteProperty(window, "desktop"); if (mediaDevices) Object.defineProperty(navigator, "mediaDevices", mediaDevices); else Reflect.deleteProperty(navigator, "mediaDevices"); vi.restoreAllMocks(); });
it.each([false, true])("allows Windows computer audio only if own-app exclusion is supported (%s)", async supported => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getSupportedConstraints: () => ({ restrictOwnAudio: supported }) } });
  let request!: (value: ScreenShareRequest) => void;
  const respond = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(window, "desktop", { configurable: true, value: { platform: "win32", capture: {
    onRequest: (listener: typeof request) => { request = listener; return () => {}; }, onDismiss: () => () => {}, respond,
  } } });
  render(<ScreenShareDialogHost />);
  act(() => request({ id: "capture", sources: [{ id: "screen:1", name: "Desktop", kind: "screen", thumbnail: "" }], audioRequested: true, systemAudioSupported: true }));
  const audio = screen.getByRole("checkbox") as HTMLInputElement;
  expect(audio.checked).toBe(supported); expect(audio.disabled).toBe(!supported);
  if (!supported) expect(screen.getByText(/requires Windows 11/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Desktop" }));
  fireEvent.click(screen.getByRole("button", { name: "Share now" }));
  await waitFor(() => expect(respond).toHaveBeenCalledWith("capture", "screen:1", supported, 30));
});
it("offers opt-in 60 FPS and resets to 30 FPS for the next share", async () => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  let request!: (value: ScreenShareRequest) => void;
  const respond = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(window, "desktop", { configurable: true, value: { capture: {
    onRequest: (listener: typeof request) => { request = listener; return () => {}; },
    onDismiss: () => () => {}, respond,
  } } });
  render(<ScreenShareDialogHost />);
  const capture: ScreenShareRequest = { id: "first", sources: [{ id: "screen:1", name: "Desktop", kind: "screen", thumbnail: "data:image/png;base64,test" }], audioRequested: true, systemAudioSupported: true };
  act(() => request(capture));
  expect((screen.getByLabelText("Stream frame rate") as HTMLSelectElement).value).toBe("30");
  fireEvent.change(screen.getByLabelText("Stream frame rate"), { target: { value: "60" } });
  fireEvent.click(screen.getByRole("button", { name: "Desktop" }));
  fireEvent.click(screen.getByRole("button", { name: "Share now" }));
  await waitFor(() => expect(respond).toHaveBeenCalledWith("first", "screen:1", true, 60));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  act(() => request({ ...capture, id: "second" }));
  expect((screen.getByLabelText("Stream frame rate") as HTMLSelectElement).value).toBe("30");
});
