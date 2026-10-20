import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { cameraQualityPresets } from "../../domain/calls/CameraQuality";
function fixture() {
  const camera = { readyState: "live", applyConstraints: vi.fn().mockResolvedValue(undefined), addEventListener: vi.fn() };
  const screen = { stop: vi.fn(), addEventListener: vi.fn() };
  const getUserMedia = vi.fn().mockResolvedValue({ getVideoTracks: () => [camera] });
  const getDisplayMedia = vi.fn().mockResolvedValue({ getVideoTracks: () => [screen], getAudioTracks: () => [{}] });
  const postMessage = vi.fn(); let listener: (event: object) => Promise<void> = async () => {};
  const parent = { postMessage };
  const context = { navigator: { mediaDevices: { getUserMedia, getDisplayMedia } }, parent, location: { origin: "http://localhost", hash: "#?widgetId=test&grungusCameraQuality=720p&parentUrl=http%3A%2F%2Flocalhost%2F" }, URL, URLSearchParams, window: { addEventListener: (_event: string, callback: typeof listener) => { listener = callback; } } };
  const source = readFileSync("scripts/element-call-media.js", "utf8").replace("__GRUNGUS_CAMERA_PRESETS__", JSON.stringify(cameraQualityPresets));
  runInNewContext(source, context);
  return { media: context.navigator.mediaDevices, camera, screen, getUserMedia, getDisplayMedia, postMessage, parent, listener };
}
describe("Element Call camera and display capture adapter", () => {
  it("applies camera presets while preserving device choice and microphone settings", async () => {
    const { media, getUserMedia } = fixture();
    await media.getUserMedia({ audio: { echoCancellation: true }, video: { deviceId: { exact: "camera" } } } as never);
    expect(getUserMedia).toHaveBeenCalledWith(expect.objectContaining({ audio: { echoCancellation: true }, video: expect.objectContaining({ deviceId: { exact: "camera" }, height: { ideal: 720, max: 720 } }) }));
  });
  it("changes live camera quality only for authenticated parent messages", async () => {
    const { media, camera, parent, listener } = fixture(); await media.getUserMedia({ video: true } as never);
    await listener({ source: {}, origin: "http://localhost", data: { type: "grungus:camera-quality", widgetId: "test", quality: "1080p" } });
    expect(camera.applyConstraints).not.toHaveBeenCalled();
    await listener({ source: parent, origin: "http://localhost", data: { type: "grungus:camera-quality", widgetId: "test", quality: "360p" } });
    expect(camera.applyConstraints).toHaveBeenCalledWith(expect.objectContaining({ height: { ideal: 360, max: 360 } }));
  });
  it("requests unprocessed system audio and reports capture stop", async () => {
    const { media, getDisplayMedia, postMessage, screen } = fixture();
    await media.getDisplayMedia({ video: true, audio: false } as never);
    expect(getDisplayMedia).toHaveBeenCalledWith(expect.objectContaining({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, systemAudio: "include" }));
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ sharing: true, systemAudio: true }), "http://localhost");
    screen.stop(); expect(postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ sharing: false, systemAudio: false }), "http://localhost");
  });
});
