import { cameraConstraints, isCameraQuality, loadCameraQuality, saveCameraQuality, type CameraQuality } from "../../domain/calls/CameraQuality";
﻿import { CallDirection, CallErrorCode, CallEvent, CallState, CallType, createNewMatrixCall, type MatrixCall } from "matrix-js-sdk/lib/webrtc/call";
import type { MatrixClient } from "matrix-js-sdk";
import { CallEventHandlerEvent } from "matrix-js-sdk/lib/webrtc/callEventHandler";
import type { DirectCallState } from "../../domain/calls/DirectCall";
import { preferences } from "../../domain/settings/Preferences";

export class MatrixDirectCalls {
  private cameraQuality = loadCameraQuality();
  private constrainedTracks = new WeakSet<MediaStreamTrack>();
  private client: MatrixClient | null = null;
  private call: MatrixCall | null = null;
  private error: string | null = null;
  private listeners = new Set<(state: DirectCallState | null) => void>();
  private unsubscribeCall: (() => void) | null = null;
  attach(client: MatrixClient) { this.dispose(); this.client = client; client.on(CallEventHandlerEvent.Incoming, this.incoming); }
  dispose() { this.client?.off(CallEventHandlerEvent.Incoming, this.incoming); if (this.call && this.call.state !== CallState.Ended) this.call.hangup(CallErrorCode.UserHangup, false); this.unsubscribeCall?.(); this.unsubscribeCall = null; this.call = null; this.client = null; this.publish(); }
  subscribe = (listener: (state: DirectCallState | null) => void) => { this.listeners.add(listener); listener(this.snapshot()); return () => { this.listeners.delete(listener); }; };
  private snapshot(): DirectCallState | null {
    const call = this.call;
    if (!call) return null;
    return { id: call.callId, roomId: call.roomId, name: call.getOpponentMember()?.name ?? this.client?.getRoom(call.roomId)?.name ?? call.roomId,
      state: call.state, incoming: call.direction === CallDirection.Inbound, video: call.type === CallType.Video,
      microphoneMuted: call.isMicrophoneMuted(), cameraMuted: call.isLocalVideoMuted(), cameraQuality: this.cameraQuality, screenSharing: call.isScreensharing(), screenAudio: Boolean(call.opponentSupportsSDPStreamMetadata() && call.localScreensharingStream?.getAudioTracks().some(track => track.readyState === "live")), error: this.error,
      feeds: call.getFeeds().map(feed => ({ id: feed.stream.id, stream: feed.stream, local: feed.isLocal(), screenshare: feed.purpose === "m.screenshare" })) };
  }
  private publish = () => {
    for (const track of this.call?.localUsermediaStream?.getVideoTracks() ?? []) if (!this.constrainedTracks.has(track)) { this.constrainedTracks.add(track); void track.applyConstraints(cameraConstraints(this.cameraQuality)).catch(() => { this.error = "Kameraqualitaet konnte nicht angewendet werden"; this.publish(); }); }
    const state = this.snapshot(); for (const listener of this.listeners) listener(state); };
  private incoming = (call: MatrixCall) => {
    if (call.groupCallId) return;
    if (this.call && this.call.state !== CallState.Ended) { call.reject(); return; }
    this.track(call);
  };
  private track(call: MatrixCall) {
    this.unsubscribeCall?.(); this.cameraQuality = loadCameraQuality(); this.call = call; this.error = null;
    const error = (value: Error) => { this.error = value.message; this.publish(); };
    const replaced = (next: MatrixCall) => this.track(next);
    call.on(CallEvent.State, this.publish); call.on(CallEvent.FeedsChanged, this.publish); call.on(CallEvent.Hangup, this.publish); call.on(CallEvent.Error, error); call.on(CallEvent.Replaced, replaced);
    this.unsubscribeCall = () => { call.off(CallEvent.State, this.publish); call.off(CallEvent.FeedsChanged, this.publish); call.off(CallEvent.Hangup, this.publish); call.off(CallEvent.Error, error); call.off(CallEvent.Replaced, replaced); };
    this.publish();
  }
  start = async (roomId: string, video: boolean) => {
    if (!this.client) throw new Error("Nicht verbunden");
    if (this.call && this.call.state !== CallState.Ended) throw new Error("Es läuft bereits ein Anruf");
    const room = this.client.getRoom(roomId);
    if (room?.getMyMembership() !== "join" || room.getJoinedMemberCount() !== 2) throw new Error("Klassische Anrufe benötigen einen Raum mit genau zwei Mitgliedern");
    await this.applyMediaPreferences();
    const call = createNewMatrixCall(this.client, roomId);
    if (!call) throw new Error("WebRTC ist auf diesem Gerät nicht verfügbar");
    this.track(call);
    try { await (video ? call.placeVideoCall() : call.placeVoiceCall()); }
    catch (error) { this.error = error instanceof Error ? error.message : "Anruf fehlgeschlagen"; call.hangup(CallErrorCode.UserHangup, false); this.publish(); }
  };
  answer = async () => {
    const call = this.call;
    if (!call || call.state !== CallState.Ringing) return;
    try { await this.applyMediaPreferences(); await call.answer(true, call.type === CallType.Video); }
    catch (error) { this.error = error instanceof Error ? error.message : "Anruf konnte nicht angenommen werden"; this.publish(); }
  };
  reject = () => { this.call?.reject(); this.publish(); };
  hangup = () => { this.call?.hangup(CallErrorCode.UserHangup, false); this.publish(); };
  close = () => { if (this.call && this.call.state !== CallState.Ended) this.hangup(); this.unsubscribeCall?.(); this.unsubscribeCall = null; this.call = null; this.publish(); };
  setCameraQuality = async (quality: CameraQuality) => {
    if (!isCameraQuality(quality)) throw new Error("Ungueltige Kameraqualitaet");
    for (const track of this.call?.localUsermediaStream?.getVideoTracks() ?? []) await track.applyConstraints(cameraConstraints(quality));
    this.cameraQuality = quality; saveCameraQuality(quality); this.publish();
  };
  toggleScreenshare = async () => {
    const call = this.call;
    if (!call || call.state !== CallState.Connected) throw new Error("Verbinde den Anruf, bevor du deinen Bildschirm teilst");
    const enabled = !call.isScreensharing();
    const result = await call.setScreensharingEnabled(enabled, { audio: call.opponentSupportsSDPStreamMetadata(), throwOnFail: true });
    if (enabled && !result) throw new Error("Bildschirmfreigabe abgebrochen oder fehlgeschlagen");
    if (enabled) for (const track of call.localScreensharingStream?.getVideoTracks() ?? []) track.addEventListener("ended", () => { if (this.call === call && call.isScreensharing()) void call.setScreensharingEnabled(false).finally(this.publish); }, { once: true });
    this.publish();
  };
  toggleMicrophone = async () => { if (this.call) await this.call.setMicrophoneMuted(!this.call.isMicrophoneMuted()); this.publish(); };
  private async applyMediaPreferences() {
    if (!this.client) return;
    const prefs = preferences.getSnapshot();
    const handler = this.client.getMediaHandler();
    await handler.setMediaInputs(prefs.audioInput, prefs.videoInput);
    await handler.setAudioSettings({ echoCancellation: prefs.echoCancellation, noiseSuppression: prefs.noiseSuppression, autoGainControl: prefs.autoGainControl });
  }
  toggleCamera = async () => { if (this.call) await this.call.setLocalVideoMuted(!this.call.isLocalVideoMuted()); this.publish(); };
}
