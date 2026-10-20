import { CallPanel } from "../../src/renderer/features/chat/CallPanel";
import { createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import { ScreenShareDialogHost } from "../../src/renderer/features/chat/ScreenShareDialog";
import "../../src/renderer/styles/index.css";
﻿// An isolated widget host: no access token, real contacts, room writes, or real media.
import { MatrixEvent, Room, createClient } from "matrix-js-sdk";
import { mountMatrixCall } from "../../src/infrastructure/matrix/MatrixCallDriver";
const userId = "@smoke:invalid.test";
const client = createClient({ baseUrl: "https://matrix.invalid", userId, deviceId: "SMOKE" });
const room = new Room("!smoke:invalid.test", client, userId);
room.currentState.setStateEvents([
  new MatrixEvent({ type: "m.room.create", state_key: "", room_id: room.roomId, event_id: "$create", sender: userId, content: { creator: userId, room_version: "10", type: "org.matrix.msc3417.call" } }),
  ...[userId].map(member => new MatrixEvent({ type: "m.room.member", state_key: member, room_id: room.roomId, event_id: `$${member}`, sender: member, content: { membership: "join", displayname: "Smoke" } })),
]);
room.updateMyMembership("join");
client.store.storeRoom(room);
client.getOpenIdToken = async () => { window.__smokeAutoJoinAttempted = true; throw new Error("Smoke test forbids authorization"); };
client._unstable_getRTCTransports = async () => [{ type: "livekit", livekit_service_url: "https://rtc.invalid" }];
client.sendStateEvent = async () => { throw new Error("Smoke test forbids state writes"); };
client.sendEvent = async () => { throw new Error("Smoke test forbids messages"); };
const mount = (frame, roomId, video, onClose, onReady, onJoined, options) => { window.__smokeNotifyJoined = onJoined; return mountMatrixCall(client, frame, roomId, video, onClose, onReady, onJoined, options); };
const close = () => {};
function VoiceWorkspace() {
  const [dock, setDock] = useState<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(true);
  const [chatEnabled, setChatEnabled] = useState(false);
  const [chatVisible, setChatVisible] = useState(true);
  const [unread, setUnread] = useState(0);
  window.__smokeBrowseAway = () => setVisible(false);
  window.__smokeEnableChat = () => setChatEnabled(true);
  window.__smokeVoiceUnread = setUnread;
  return createElement("main", { className: "app-shell" },
    createElement("aside", { className: "room-sidebar" },
      createElement("header", { className: "sidebar-header" }, "Test server"),
      createElement("div", { className: "room-list" }, "Voice channels"),
      createElement("div", { className: "voice-dock-slot", ref: setDock }),
      createElement("footer", { className: "account-strip" }, "Smoke")),
    createElement("section", { className: "chat-workspace" }, "Another conversation"),
    createElement(CallPanel, { roomId: room.roomId, name: "Testanruf", video: false, mode: "voice", autoJoin: new URLSearchParams(location.search).has("autojoin"), dock, visible, onOpen: () => setVisible(true), onClose: close, mount,
      chat: chatEnabled ? createElement("aside", {className:"voice-channel-chat"}, createElement("textarea", {"aria-label":"Voice draft", defaultValue:"Unsent draft"})) : undefined,
      chatVisible, chatUnreadCount:unread, onToggleChat:() => { setChatVisible(!chatVisible); if (!chatVisible) setUnread(0); },
    }));
}
createRoot(document.getElementById("call-preview-root")!).render(createElement(VoiceWorkspace));

Object.defineProperty(window, "desktop", { value: { platform: "win32", capture: {
 onRequest: callback => { window.__smokeShareRequest = callback; return () => {}; },
 onDismiss: () => () => {},
 respond: async (requestId, sourceId, audio) => { window.__smokeShareResponse = { requestId, sourceId, audio }; },
} } });
createRoot(document.getElementById("capture-dialog-root")!).render(createElement(ScreenShareDialogHost));
