import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { cameraQualityPresets } from "../../domain/calls/CameraQuality";
function fixture(document = { querySelector: vi.fn(), documentElement: { toggleAttribute: vi.fn(), style: { setProperty: vi.fn() } } }) {
  const camera = { readyState: "live", applyConstraints: vi.fn().mockResolvedValue(undefined), addEventListener: vi.fn() };
  const screen = { stop: vi.fn(), addEventListener: vi.fn() };
  const getUserMedia = vi.fn().mockResolvedValue({ getVideoTracks: () => [camera] });
  const getDisplayMedia = vi.fn().mockResolvedValue({ getVideoTracks: () => [screen], getAudioTracks: () => [{}] });
  const postMessage = vi.fn(); let listener: (event: object) => Promise<void> = async () => {};
  const parent = { postMessage };
  const context = { document, navigator: { mediaDevices: { getUserMedia, getDisplayMedia } }, parent, location: { origin: "http://localhost", hash: "#?widgetId=test&grungusCameraQuality=720p&parentUrl=http%3A%2F%2Flocalhost%2F" }, URL, URLSearchParams, window: { addEventListener: (_event: string, callback: typeof listener) => { listener = callback; } } };
  const source = readFileSync("scripts/element-call-media.js", "utf8").replace("__GRUNGUS_CAMERA_PRESETS__", JSON.stringify(cameraQualityPresets));
  runInNewContext(source, context);
  return { media: context.navigator.mediaDevices, camera, screen, getUserMedia, getDisplayMedia, postMessage, parent, listener };
}
describe("Element Call camera and display capture adapter", () => {
  it("reports selected WebRTC round-trip times only to the authenticated host", async () => {
    let receive!: (event: object) => Promise<void>;
    const postMessage = vi.fn();
    const parent = { postMessage };
    const reports = new Map<string, object>([
      ["transport", { type: "transport", selectedCandidatePairId: "selected" }],
      ["selected", { id: "selected", type: "candidate-pair", state: "succeeded", currentRoundTripTime: .037 }],
      ["old", { id: "old", type: "candidate-pair", state: "succeeded", nominated: true, currentRoundTripTime: 1 }],
    ]);
    class Connection {
      connectionState = "connected";
      getStats = vi.fn().mockResolvedValue(reports);
      addEventListener = vi.fn();
    }
    const context = {
      navigator: { mediaDevices: { getUserMedia: vi.fn() } }, parent,
      location: { hash: "#?widgetId=test&parentUrl=http%3A%2F%2Flocalhost%2F" }, URL, URLSearchParams,
      window: { RTCPeerConnection: Connection, addEventListener: (_: string, callback: typeof receive) => { receive = callback; } },
    };
    runInNewContext(readFileSync("scripts/element-call-media.js", "utf8").replace("__GRUNGUS_CAMERA_PRESETS__", JSON.stringify(cameraQualityPresets)), context);
    const connection = new context.window.RTCPeerConnection();
    const data = { type: "grungus:connection-stats", widgetId: "test" };
    for (const event of [{ source: {}, origin: "http://localhost", data }, { source: parent, origin: "https://evil.test", data }, { source: parent, origin: "http://localhost", data: { ...data, widgetId: "other" } }]) await receive(event);
    expect(connection.getStats).not.toHaveBeenCalled();
    await receive({ source: parent, origin: "http://localhost", data });
    expect(postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ pingMs: 37 }), "http://localhost");
    connection.connectionState = "disconnected";
    await receive({ source: parent, origin: "http://localhost", data });
    expect(postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ pingMs: null }), "http://localhost");
    connection.connectionState = "closed";
    await receive({ source: parent, origin: "http://localhost", data });
    connection.connectionState = "connected";
    await receive({ source: parent, origin: "http://localhost", data });
    expect(connection.getStats).toHaveBeenCalledTimes(1);
  });

  it("forwards authenticated sharing actions to Element's capture publisher and reports unavailable controls", async () => {
    const button = { click: vi.fn(), disabled: false };
    const querySelector = vi.fn().mockReturnValue(button);
    const { parent, listener, postMessage, getDisplayMedia } = fixture({ querySelector, documentElement: { toggleAttribute: vi.fn(), style: { setProperty: vi.fn() } } });
    const data = { type: "grungus:toggle-screenshare", widgetId: "test" };
    for (const event of [{ source: {}, origin: "http://localhost", data }, { source: parent, origin: "http://evil.test", data }, { source: parent, origin: "http://localhost", data: { ...data, widgetId: "other" } }]) await listener(event);
    expect(button.click).not.toHaveBeenCalled();
    await listener({ source: parent, origin: "http://localhost", data });
    expect(querySelector).toHaveBeenCalledWith('button[data-testid="incall_screenshare"]');
    expect(button.click).toHaveBeenCalledTimes(1);
    expect(getDisplayMedia).not.toHaveBeenCalled();
    expect(postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ shareAction: true }), "http://localhost");
    button.disabled = true;
    await listener({ source: parent, origin: "http://localhost", data });
    expect(button.click).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ shareError: expect.any(String) }), "http://localhost");
    querySelector.mockReturnValue(null);
    await listener({ source: parent, origin: "http://localhost", data });
    expect(postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ shareError: expect.any(String) }), "http://localhost");
  });
  it("applies microphone processing only for authenticated host settings and reports failures", async () => {
    const configure = vi.fn().mockResolvedValue(undefined);
    const postMessage = vi.fn();
    const parent = { postMessage };
    let receive!: (event: object) => Promise<void>;
    const context = { navigator: { mediaDevices: { getUserMedia: vi.fn() } }, parent, location: { hash: "#?widgetId=test&grungusAudio=%7B%22inputGain%22%3A80%7D&parentUrl=http%3A%2F%2Flocalhost%2F" }, URL, URLSearchParams, window: { grungusAudio: { configure }, addEventListener: (type: string, listener: typeof receive) => { if (type === "message") receive = listener; } } };
    runInNewContext(readFileSync("scripts/element-call-media.js", "utf8").replace("__GRUNGUS_CAMERA_PRESETS__", JSON.stringify(cameraQualityPresets)), context);
    expect(configure).toHaveBeenCalledWith({ inputGain: 80 });
    configure.mockClear();
    const data = { type: "grungus:audio-settings", widgetId: "test", options: { inputGain: 120, advancedNoiseSuppression: true } };
    for (const event of [{ source: {}, origin: "http://localhost", data }, { source: parent, origin: "https://evil.test", data }, { source: parent, origin: "http://localhost", data: { ...data, widgetId: "other" } }]) await receive(event);
    expect(configure).not.toHaveBeenCalled();
    await receive({ source: parent, origin: "http://localhost", data });
    expect(configure).toHaveBeenCalledWith(data.options);
    expect(postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ audioError: null }), "http://localhost");
    configure.mockRejectedValue(new Error("Device unavailable"));
    await receive({ source: parent, origin: "http://localhost", data });
    expect(postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ audioError: expect.any(String) }), "http://localhost");
  });
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
  it("accepts deafen only from the authenticated host and acknowledges output failures", async () => {
    const setAudioEnabled = vi.fn();
    const { parent, listener, postMessage } = fixture();
    // The adapter runs in an isolated VM; inject the same native output API Element Call exposes.
    const context = { navigator: { mediaDevices: { getUserMedia: vi.fn() } }, parent, location: { hash: "#?widgetId=test&parentUrl=http%3A%2F%2Flocalhost%2F" }, URL, URLSearchParams, window: { controls: { setAudioEnabled }, addEventListener: (_: string, callback: typeof listener) => { receive = callback; } } };
    let receive = listener;
    runInNewContext(readFileSync("scripts/element-call-media.js", "utf8").replace("__GRUNGUS_CAMERA_PRESETS__", JSON.stringify(cameraQualityPresets)), context);
    const data = { type: "grungus:deafen", widgetId: "test", deafened: true };
    await receive({ source: {}, origin: "http://localhost", data });
    await receive({ source: parent, origin: "http://evil.test", data });
    await receive({ source: parent, origin: "http://localhost", data: { ...data, widgetId: "other" } });
    expect(setAudioEnabled).not.toHaveBeenCalled();
    await receive({ source: parent, origin: "http://localhost", data });
    expect(setAudioEnabled).toHaveBeenLastCalledWith(false);
    expect(postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ deafened: true }), "http://localhost");
    await receive({ source: parent, origin: "http://localhost", data: { ...data, deafened: false } });
    expect(setAudioEnabled).toHaveBeenLastCalledWith(true);
    setAudioEnabled.mockImplementation(() => { throw new Error("Not connected"); });
    await receive({ source: parent, origin: "http://localhost", data });
    expect(postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ deafenError: expect.any(String) }), "http://localhost");
  });
});
