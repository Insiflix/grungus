import { afterEach, describe, expect, it, vi } from "vitest";
import type { DesktopCapturerSource, DisplayMediaRequestHandlerHandlerRequest } from "electron";
import { DesktopCaptureBroker } from "../../../electron/desktopCapture";
const source = (id: string) => ({ id, name: id, thumbnail: { toDataURL: () => "data:image/png;base64,test" } }) as DesktopCapturerSource;
const request = { videoRequested: true, audioRequested: true } as DisplayMediaRequestHandlerHandlerRequest;
function fixture(platform: NodeJS.Platform = "win32") {
  const sources = [source("screen:1:0"), source("window:2:0")];
  const notify = vi.fn(), dismiss = vi.fn(), callback = vi.fn();
  const isTrusted = vi.fn(() => true);
  const broker = new DesktopCaptureBroker({ platform, getSources: async () => sources, isTrusted, notify, dismiss });
  return { broker, notify, dismiss, callback, sources, isTrusted };
}
afterEach(() => { vi.useRealTimers(); });
describe("screen capture consent and system audio", () => {
  it("never selects a desktop until the user responds", async () => {
    const { broker, notify, callback, sources } = fixture();
    await broker.request(request, callback);
    expect(callback).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ systemAudioSupported: true, audioRequested: true }));
    broker.respond(notify.mock.calls[0][0].id, sources[0].id, true);
    expect(callback).toHaveBeenCalledWith({ video: sources[0], audio: "loopback" });
  });
  it("allows whole-system audio with a window only after confirmation", async () => {
    const { broker, notify, callback, sources } = fixture();
    await broker.request(request, callback);
    broker.respond(notify.mock.calls[0][0].id, sources[1].id, true);
    expect(callback).toHaveBeenCalledWith({ video: sources[1], audio: "loopback" });
  });
  it.each(["audio-off", "not-requested", "unsupported"])("omits loopback when %s", async mode => {
    const { broker, notify, callback, sources } = fixture(mode === "unsupported" ? "linux" : "win32");
    await broker.request({ ...request, audioRequested: mode !== "not-requested" }, callback);
    broker.respond(notify.mock.calls[0][0].id, sources[0].id, mode !== "audio-off");
    expect(callback).toHaveBeenCalledWith({ video: sources[0] });
  });
  it("rejects cancellation, unknown sources, and untrusted frames", async () => {
    const { broker, notify, callback, isTrusted } = fixture();
    await broker.request(request, callback); broker.respond(notify.mock.calls[0][0].id, "window:forged", true);
    expect(callback).toHaveBeenLastCalledWith({});
    await broker.request(request, callback); broker.cancel(); expect(callback).toHaveBeenLastCalledWith({});
    isTrusted.mockReturnValue(false); await broker.request(request, callback); expect(callback).toHaveBeenLastCalledWith({});
  });
  it("ignores stale responses and cancels expired picker requests", async () => {
    vi.useFakeTimers();
    const { broker, notify, callback } = fixture();
    await broker.request(request, callback);
    broker.respond("wrong-id", "screen:1:0", true); expect(callback).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(120000); expect(callback).toHaveBeenCalledWith({});
    broker.respond(notify.mock.calls[0][0].id, "screen:1:0", true); expect(callback).toHaveBeenCalledTimes(1);
  });
});
