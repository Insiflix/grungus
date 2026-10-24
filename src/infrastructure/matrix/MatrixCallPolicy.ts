import { microphoneOptions } from "../desktop/Microphone";
import { loadCameraQuality } from "../../domain/calls/CameraQuality";
import type { Room } from "matrix-js-sdk";
﻿import { EventDirection, EventKind, MatrixCapabilities, WidgetEventCapability, type Capability } from "matrix-widget-api";
export const callEvents = new Set(["m.call.notify", "org.matrix.msc4075.call.notify", "org.matrix.msc4143.rtc.notification", "org.matrix.msc4075.rtc.notification", "m.rtc.notification", "m.call.encryption_keys", "io.element.call.encryption_keys", "m.reaction", "m.room.redaction", "org.matrix.rageshake_request", "m.rtc.decline", "org.matrix.msc4310.rtc.decline", "m.rtc.member", "org.matrix.msc4143.rtc.member", "io.element.call.reaction"]);
export const callState = new Set(["org.matrix.msc3401.call.member", "m.call.member"]);
export const readableCallState = new Set(["m.room.create", "m.room.name", "m.room.member", "m.room.encryption", "org.matrix.msc4143.rtc.slot", ...callState]);
export const callToDevice = new Set(["m.call.invite", "m.call.candidates", "m.call.answer", "m.call.hangup", "m.call.reject", "m.call.select_answer", "m.call.negotiate", "m.call.sdp_stream_metadata_changed", "org.matrix.call.sdp_stream_metadata_changed", "m.call.replaces", "m.call.encryption_keys", "io.element.call.encryption_keys"]);
export function isConversationCall(room: Room | null, allRooms: Room[]): boolean {
  if (!room || ["org.matrix.msc3417.call", "io.element.video", "m.call"].includes(room.getType?.() ?? "")) return false;
  const parents = room.currentState?.getStateEvents("m.space.parent") ?? [];
  if (parents.some(event => event.getContent().via?.length)) return false;
  return !allRooms.some(space => space.isSpaceRoom?.() && space.currentState?.getStateEvents("m.space.child", room.roomId)?.getContent().via?.length);
}
export function ownCallStateKeys(userId: string, deviceId: string) { return [userId, `_${userId}_${deviceId}_m.call`, `${userId}_${deviceId}_m.call`]; }
export function allowedCallCapabilities(requested: Set<Capability>, userId: string, deviceId: string, roomId: string): Set<Capability> {
  const basic = new Set<string>([`org.matrix.msc2762.timeline:${roomId}`, MatrixCapabilities.AlwaysOnScreen, MatrixCapabilities.MSC4039DownloadFile, MatrixCapabilities.MSC4157SendDelayedEvent, MatrixCapabilities.MSC4157UpdateDelayedEvent, MatrixCapabilities.MSC4407SendStickyEvent, MatrixCapabilities.MSC4407ReceiveStickyEvent, MatrixCapabilities.MSC4515RtcTransports]);
  const result = new Set([...requested].filter((cap) => basic.has(cap)));
  for (const cap of WidgetEventCapability.findEventCapabilities(requested)) {
    const allowed = cap.kind === EventKind.Event ? callEvents.has(cap.eventType) : cap.kind === EventKind.ToDevice ? callToDevice.has(cap.eventType) : cap.kind === EventKind.State && (cap.direction === EventDirection.Receive ? readableCallState.has(cap.eventType) : callState.has(cap.eventType) && ownCallStateKeys(userId, deviceId).includes(cap.keyStr ?? ""));
    if (allowed) result.add(cap.raw);
  }
  return result;
}
export function elementCallUrl(parentUrl: string, roomId: string, userId: string, deviceId: string, baseUrl: string, video: boolean, widgetId: string, direct = false, joining = false, skipLobby = false): string {
  const url = new URL("/element-call/index.html", parentUrl);
  if (url.protocol === "grungus-app:" && url.hostname === "client") url.hostname = "call";
  else if (url.protocol === "http:" && url.hostname === "127.0.0.1") url.hostname = "localhost";
  else if (url.protocol === "http:" && url.hostname === "localhost") url.hostname = "127.0.0.1";
  else throw new Error("Call widgets require a supported isolated application origin");
  url.hash = "?" + new URLSearchParams({ widgetId, parentUrl, roomId, userId, deviceId, baseUrl, intent: `${joining ? "join_existing" : "start_call"}${direct ? "_dm" : ""}${video ? "" : "_voice"}`, theme: "dark", background: "solid", lang: "de", header: "none", confineToRoom: "true", hideScreensharing: "false", grungusCameraQuality: loadCameraQuality(), grungusAudio: JSON.stringify(microphoneOptions()), e2eEnabled: "true" });
  if (skipLobby) url.hash += "&skipLobby=true";
  return url.href;
}

