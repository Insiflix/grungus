// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { defaultPreferences } from "../../../domain/settings/Preferences";
import { MicrophoneTest } from "./MicrophoneTest";

afterEach(() => { cleanup(); vi.restoreAllMocks(); Reflect.deleteProperty(navigator, "mediaDevices"); });
describe("microphone test lifecycle", () => {
  it("releases a microphone granted after settings have closed", async () => {
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    let grant!: (stream: MediaStream) => void;
    const getUserMedia = vi.fn(() => new Promise<MediaStream>(resolve => { grant = resolve; }));
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
    const view = render(<MicrophoneTest prefs={{ ...defaultPreferences, audioInput: "usb-mic" }} disabled={false} />);
    await userEvent.click(screen.getByRole("button", { name: "Start microphone test" }));
    expect(getUserMedia).toHaveBeenCalledWith({ audio: { deviceId: { exact: "usb-mic" }, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    view.unmount();
    const stop = vi.fn();
    await act(async () => { grant({ getTracks: () => [{ stop }] } as unknown as MediaStream); });
    expect(stop).toHaveBeenCalledOnce();
  });
  it("reports microphone permission failure and allows retry", async () => {
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: vi.fn().mockRejectedValue(new Error("Microphone permission denied")) } });
    render(<MicrophoneTest prefs={{ ...defaultPreferences }} disabled={false} />);
    await userEvent.click(screen.getByRole("button", { name: "Start microphone test" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Microphone permission denied");
    expect(screen.getByRole("button", { name: "Start microphone test" })).toHaveProperty("disabled", false);
  });
});
