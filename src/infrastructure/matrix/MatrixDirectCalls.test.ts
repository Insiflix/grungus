import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import type { MatrixCall, MatrixClient } from "matrix-js-sdk";
import { CallDirection, CallErrorCode, CallEvent, CallState, CallType, createNewMatrixCall } from "matrix-js-sdk/lib/webrtc/call";
import { CallEventHandlerEvent } from "matrix-js-sdk/lib/webrtc/callEventHandler";
import { MatrixDirectCalls } from "./MatrixDirectCalls";
vi.mock("matrix-js-sdk/lib/webrtc/call", async importOriginal => ({ ...await importOriginal<object>(), createNewMatrixCall: vi.fn() }));
function fixture() {
  const media = { setMediaInputs: vi.fn().mockResolvedValue(undefined), setAudioSettings: vi.fn().mockResolvedValue(undefined) };
  const client = Object.assign(new EventEmitter(), { getMediaHandler: () => media, getRoom: () => ({ name: "Chat", getMyMembership: () => "join", getJoinedMemberCount: () => 2 }) });
  const controller = new MatrixDirectCalls();
  controller.attach(client as unknown as MatrixClient);
  const observer = vi.fn(); controller.subscribe(observer);
  return { client, controller, observer };
}
function makeCall() {
  const call = Object.assign(new EventEmitter(), { callId: "call", roomId: "!room:test", state: CallState.Ringing, direction: CallDirection.Inbound, type: CallType.Video,
    getOpponentMember: () => ({ name: "Alice" }), opponentSupportsSDPStreamMetadata: (): boolean => true, isScreensharing: () => false, setScreensharingEnabled: vi.fn().mockResolvedValue(true), isMicrophoneMuted: () => false, isLocalVideoMuted: () => false, getFeeds: () => [],
    answer: vi.fn().mockResolvedValue(undefined), reject: vi.fn(), hangup: vi.fn(), placeVoiceCall: vi.fn().mockResolvedValue(undefined), placeVideoCall: vi.fn().mockResolvedValue(undefined), setMicrophoneMuted: vi.fn(), setLocalVideoMuted: vi.fn(),
  });
  return call;
}
describe("classic Matrix call compatibility", () => {
  it("surfaces incoming calls without opening camera or answering automatically", async () => {
    const { client, controller, observer } = fixture(); const call = makeCall();
    client.emit(CallEventHandlerEvent.Incoming, call);
    expect(observer).toHaveBeenLastCalledWith(expect.objectContaining({ incoming: true, name: "Alice", state: "ringing" }));
    expect(call.answer).not.toHaveBeenCalled();
    await controller.answer();
    expect(call.answer).toHaveBeenCalledWith(true, true);
    controller.dispose();
  });
  it("rejects another incoming call while already busy", () => {
    const { client, controller } = fixture(); const first = makeCall(), second = makeCall();
    client.emit(CallEventHandlerEvent.Incoming, first); client.emit(CallEventHandlerEvent.Incoming, second);
    expect(second.reject).toHaveBeenCalledOnce(); expect(first.reject).not.toHaveBeenCalled(); controller.dispose();
  });
  it("routes explicitly requested voice and video calls through the SDK", async () => {
    const { controller } = fixture(); const call = makeCall();
    vi.mocked(createNewMatrixCall).mockReturnValue(call as unknown as MatrixCall);
    await controller.start("!room:test", false);
    expect(call.placeVoiceCall).toHaveBeenCalledOnce(); expect(call.placeVideoCall).not.toHaveBeenCalled();
    controller.close(); expect(call.hangup).toHaveBeenCalledWith(CallErrorCode.UserHangup, false);
    await controller.start("!room:test", true); expect(call.placeVideoCall).toHaveBeenCalledOnce(); controller.dispose();
  });
  it("keeps media errors visible and removes call listeners on logout", async () => {
    const { client, controller, observer } = fixture(); const call = makeCall();
    vi.mocked(createNewMatrixCall).mockReturnValue(call as unknown as MatrixCall);
    call.placeVoiceCall.mockRejectedValueOnce(new Error("Microphone denied"));
    await controller.start("!room:test", false);
    expect(observer).toHaveBeenLastCalledWith(expect.objectContaining({ error: "Microphone denied" }));
    call.emit(CallEvent.Error, new Error("ICE failed"));
    expect(observer).toHaveBeenLastCalledWith(expect.objectContaining({ error: "ICE failed" }));
    controller.dispose(); expect(client.listenerCount(CallEventHandlerEvent.Incoming)).toBe(0); expect(call.listenerCount(CallEvent.State)).toBe(0);
  });
});

it("changes camera constraints without changing a screen track", async () => {
 const { client, controller } = fixture(); const call = makeCall();
 const camera = { applyConstraints: vi.fn().mockResolvedValue(undefined) };
 Object.assign(call, { localUsermediaStream: { getVideoTracks: () => [camera] } });
 client.emit(CallEventHandlerEvent.Incoming, call);
 await controller.setCameraQuality("360p");
 expect(camera.applyConstraints).toHaveBeenLastCalledWith(expect.objectContaining({ height: { ideal: 360, max: 360 }, frameRate: { ideal: 15, max: 15 } }));
 controller.dispose();
});
it("requests screen audio and rejects capture failures", async () => {
 const { client, controller } = fixture(); const call = makeCall(); call.state = CallState.Connected;
 client.emit(CallEventHandlerEvent.Incoming, call);
 await controller.toggleScreenshare();
 expect(call.setScreensharingEnabled).toHaveBeenCalledWith(true, { audio: true, throwOnFail: true });
 call.setScreensharingEnabled.mockResolvedValueOnce(false);
 await expect(controller.toggleScreenshare()).rejects.toThrow("abgebrochen");
 controller.dispose();
});

it("does not claim screen audio support for older peers without stream metadata", async () => {
 const { client, controller, observer } = fixture(); const call = makeCall(); call.state = CallState.Connected;
 call.opponentSupportsSDPStreamMetadata = () => false;
 client.emit(CallEventHandlerEvent.Incoming, call);
 await controller.toggleScreenshare();
 expect(call.setScreensharingEnabled).toHaveBeenCalledWith(true, { audio: false, throwOnFail: true });
 expect(observer).toHaveBeenLastCalledWith(expect.objectContaining({ screenAudio: false }));
 controller.dispose();
});
