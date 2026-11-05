import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cameraQualityPresets } from "../../domain/calls/CameraQuality";
function fixture(document = { querySelector: vi.fn(), documentElement: { toggleAttribute: vi.fn(), style: { setProperty: vi.fn() } } }, extraWindow: object = {}) {
  const camera = { readyState: "live", applyConstraints: vi.fn().mockResolvedValue(undefined), addEventListener: vi.fn() };
  const screen = { stop: vi.fn(), addEventListener: vi.fn(), applyConstraints: vi.fn().mockResolvedValue(undefined) };
  const getUserMedia = vi.fn().mockResolvedValue({ getVideoTracks: () => [camera] });
  const getDisplayMedia = vi.fn().mockResolvedValue({ getVideoTracks: () => [screen], getAudioTracks: () => [{}] });
  const postMessage = vi.fn(); let listener: (event: object) => Promise<void> = async () => {};
  const parent = { postMessage };
  const events = new Map<string, typeof listener>();
  const context = { document, navigator: { mediaDevices: { getUserMedia, getDisplayMedia } }, parent, location: { origin: "http://localhost", hash: "#?widgetId=test&grungusCameraQuality=720p&parentUrl=http%3A%2F%2Flocalhost%2F" }, URL, URLSearchParams, Date, setTimeout, clearTimeout, window: { ...extraWindow, addEventListener: (_event: string, callback: typeof listener) => { events.set(_event, callback); if (_event === "message") listener = callback; } } };
  const source = readFileSync("scripts/element-call-media.js", "utf8").replace("__GRUNGUS_CAMERA_PRESETS__", JSON.stringify(cameraQualityPresets));
  runInNewContext(source, context);
  return { media: context.navigator.mediaDevices, camera, screen, getUserMedia, getDisplayMedia, postMessage, parent, listener, window: context.window, events };
}
afterEach(() => vi.restoreAllMocks());
describe("Element Call camera and display capture adapter", () => {
  it.each([30, 60])("uses %i FPS only after the authenticated picker response", async frameRate => {
    const f = fixture();
    const host = (data: object) => f.listener({ source: f.parent, origin: "http://localhost", data: { widgetId: "test", ...data } });
    await host({ type: "grungus:host-controls", enabled: true, captureSettings: true });
    const capture = f.media.getDisplayMedia({ video: true });
    await vi.waitFor(() => expect(f.postMessage).toHaveBeenCalledWith(expect.objectContaining({ captureSettingsRequest: true }), "http://localhost"));
    expect(f.getDisplayMedia).toHaveBeenCalledWith(expect.objectContaining({ video: { frameRate: { ideal: 30, max: 30 } } }));
    await f.listener({ source: f.parent, origin: "https://evil.test", data: { type: "grungus:capture-settings", widgetId: "test", frameRate: 120 } });
    expect(f.screen.applyConstraints).not.toHaveBeenCalled();
    await host({ type: "grungus:capture-settings", frameRate });
    await capture;
    expect(f.screen.applyConstraints).toHaveBeenCalledWith({ frameRate: { ideal: frameRate, max: frameRate } });
  });
  it("uses the default output when LiveKit has not selected a sink yet", async () => {
    const setSinkId = vi.fn().mockResolvedValue(undefined);
    class AudioContext { setSinkId = setSinkId; }
    Object.assign(AudioContext.prototype, { setSinkId });
    fixture(undefined, { AudioContext });
    const context = Object.create(AudioContext.prototype);
    await context.setSinkId(undefined);
    expect(setSinkId).toHaveBeenLastCalledWith("");
    await context.setSinkId("speakers");
    expect(setSinkId).toHaveBeenLastCalledWith("speakers");
    const silent = { type: "none" };
    await context.setSinkId(silent);
    expect(setSinkId).toHaveBeenLastCalledWith(silent);
  });
  it.each([null, "grungus_share_test"])("attaches only the consented Linux output monitor (%s) and releases it on stop", async label => {
    const audio = { stop: vi.fn() };
    const captureSystemAudio = vi.fn().mockResolvedValue({ getAudioTracks: () => [audio], getTracks: () => [audio] });
    const f = fixture(undefined, { grungusAudio: { captureSystemAudio } });
    const addTrack = vi.fn();
    const stream = { getVideoTracks: () => [f.screen], getAudioTracks: () => [], getTracks: () => [f.screen], addTrack };
    f.getDisplayMedia.mockResolvedValue(stream);
    Object.assign(f.media, { enumerateDevices: vi.fn(async () => [{ kind: "audioinput", label: "grungus_share_test", deviceId: "monitor-id" }, { kind: "audioinput", label: "Microphone", deviceId: "mic-id" }]) });
    const host = (data: object) => f.listener({ source: f.parent, origin: "http://localhost", data: { widgetId: "test", ...data } });
    await host({ type: "grungus:host-controls", enabled: true, linuxAudio: true });
    const pending = f.media.getDisplayMedia({ video: true, audio: true });
    await vi.waitFor(() => expect(f.postMessage).toHaveBeenCalledWith(expect.objectContaining({ linuxAudioRequest: true }), "http://localhost"));
    await f.listener({ source: f.parent, origin: "https://evil.test", data: { widgetId: "test", type: "grungus:linux-audio", label: "Microphone" } });
    expect(captureSystemAudio).not.toHaveBeenCalled();
    await host({ type: "grungus:linux-audio", label });
    expect(await pending).toBe(stream);
    if (label) { expect(captureSystemAudio).toHaveBeenCalledWith("monitor-id"); expect(addTrack).toHaveBeenCalledWith(audio); }
    else expect(captureSystemAudio).not.toHaveBeenCalled();
    f.screen.stop();
    if (label) expect(audio.stop).toHaveBeenCalled();
    expect(f.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ sharing: false, linuxAudioStop: true }), "http://localhost");
  });
  it("reports speaking and video activity for local and remote users, including stop and disconnect", () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1000);
    let poll!: () => void;
    const f = fixture(undefined, { setInterval: (callback: () => void) => { poll = callback; } });
    const register = (f.window as typeof f.window & { grungusRegisterParticipant: (user: string, identity: string, participant: object | null) => void }).grungusRegisterParticipant;
    const remote = { setVolume: vi.fn(), name: "Alice", isSpeaking: true, isScreenShareEnabled: true, isCameraEnabled: false };
    register("@alice:test", "remote", remote);
    register("@me:test", "local", { name: "Me", isSpeaking: true, isCameraEnabled: true });
    poll();
    expect(f.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ activity: [
      { userId: "@alice:test", name: "Alice", speaking: true, screen: true, camera: false },
      { userId: "@me:test", name: "Me", speaking: true, screen: false, camera: true },
    ] }), "http://localhost");
    remote.isSpeaking = false; remote.isScreenShareEnabled = false;
    now.mockReturnValue(1300);
    register("@me:test", "local", null); poll();
    expect(f.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ activity: [{ userId: "@alice:test", name: "Alice", speaking: false, screen: false, camera: false }] }), "http://localhost");
  });
  it("detects each microphone without SFU speaking flags, holds short gaps, and cleans up replaced tracks", () => {
    let now = 1000, poll!: () => void;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    type Track = { level: number; enabled: boolean; readyState: string; stop: ReturnType<typeof vi.fn> };
    const sources: { disconnect: ReturnType<typeof vi.fn> }[] = [];
    const close = vi.fn().mockResolvedValue(undefined);
    class MediaStream { constructor(public tracks: Track[]) {} }
    class AudioContext {
      state = "running"; close = close;
      createMediaStreamSource(stream: MediaStream) {
        const source = { connect: (node: { track?: Track }) => { node.track = stream.tracks[0]; }, disconnect: vi.fn() };
        sources.push(source); return source;
      }
      createAnalyser() { return { fftSize: 512, track: undefined as Track | undefined, getFloatTimeDomainData(samples: Float32Array) { samples.fill(this.track?.level ?? 0); }, disconnect: vi.fn() }; }
    }
    const f = fixture(undefined, { AudioContext, MediaStream, setInterval: (callback: () => void) => { poll = callback; } });
    const register = (f.window as typeof f.window & { grungusRegisterParticipant: (user: string, identity: string, participant: object | null) => void }).grungusRegisterParticipant;
    const first: Track = { level: .02, enabled: true, readyState: "live", stop: vi.fn() };
    const second: Track = { level: 0, enabled: true, readyState: "live", stop: vi.fn() };
    const a = Object.assign(new EventEmitter(), { name: "Alice", isSpeaking: false, audioTrackPublications: new Map([["mic", { source: "microphone", isMuted: false, track: { mediaStreamTrack: first } }]]) });
    const b = Object.assign(new EventEmitter(), { name: "Bob", isSpeaking: false, audioTrackPublications: new Map([["mic", { source: "microphone", isMuted: false, track: { mediaStreamTrack: second } }]]) });
    const speaking = () => Object.fromEntries(f.postMessage.mock.lastCall![0].activity.map((member: { userId: string; speaking: boolean }) => [member.userId, member.speaking]));
    register("@alice:test", "alice", a); register("@bob:test", "bob", b);
    expect(speaking()).toEqual({ "@alice:test": true, "@bob:test": false });
    second.level = .006; b.emit("trackSubscribed");
    expect(speaking()).toEqual({ "@alice:test": true, "@bob:test": true });
    first.level = 0; now += 80; poll();
    expect(speaking()["@alice:test"]).toBe(true);
    now += 250; poll();
    expect(speaking()["@alice:test"]).toBe(false);
    const replacement = { ...first, level: .01 };
    a.audioTrackPublications.get("mic")!.track.mediaStreamTrack = replacement;
    a.emit("trackSubscribed");
    expect(speaking()["@alice:test"]).toBe(true);
    expect(sources[0].disconnect).toHaveBeenCalled();
    b.audioTrackPublications.get("mic")!.isMuted = true; b.emit("trackMuted");
    expect(speaking()["@bob:test"]).toBe(false);
    register("@alice:test", "alice", null);
    expect(a.listenerCount("isSpeakingChanged")).toBe(0);
    f.events.get("pagehide")!({});
    expect(close).toHaveBeenCalledOnce();
    expect(b.listenerCount("trackSubscribed")).toBe(0);
    expect(first.stop).not.toHaveBeenCalled(); expect(second.stop).not.toHaveBeenCalled();
  });
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
    expect(screen.applyConstraints).toHaveBeenCalledWith({ frameRate: { ideal: 30, max: 30 } });
    expect(getDisplayMedia).toHaveBeenCalledWith(expect.objectContaining({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, restrictOwnAudio: true }, systemAudio: "include" }));
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

it("applies per-user gain, preserves deafen, and restores settings after reconnect", async () => {
  const f = fixture();
  const register = (f.window as typeof f.window & { grungusRegisterParticipant: (user: string, identity: string, participant: object | null) => void }).grungusRegisterParticipant;
  const alice = { setVolume: vi.fn() }, bob = { setVolume: vi.fn() };
  const output = alice.setVolume;
  register("@alice:test", "alice-device", alice); register("@bob:test", "bob-device", bob);
  const update = (volume: number, muted = false, origin = "http://localhost") => f.listener({ source: f.parent, origin, data: { type: "grungus:participant-audio", widgetId: "test", requestId: "request", userId: "@alice:test", volume, muted } });
  await update(180, false, "https://evil.test"); expect(output).not.toHaveBeenCalled();
  await update(180);
  expect(output).toHaveBeenCalledWith(1.8, "microphone");
  alice.setVolume(0); await update(160); expect(output).toHaveBeenLastCalledWith(1.6, "screen_share_audio");
  expect(output).toHaveBeenCalledWith(0, "microphone");
  alice.setVolume(1); expect(output).toHaveBeenLastCalledWith(1.6, "microphone");
  await update(160, true); expect(output).toHaveBeenLastCalledWith(0, "screen_share_audio");
  register("@alice:test", "alice-device", null);
  register("@alice:test", "alice-device", alice);
  await update(150); expect(output).toHaveBeenCalledWith(1.5, "microphone");
  const reconnect = { setVolume: vi.fn() }; register("@alice:test", "alice-device", reconnect);
  expect(reconnect.setVolume).not.toBeUndefined();
  await update(201); expect(f.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ participantAudio: expect.objectContaining({ error: expect.any(String) }) }), "http://localhost");
});
