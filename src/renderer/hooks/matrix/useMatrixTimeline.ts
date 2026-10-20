import { useMatrixRuntime } from "../../app/providers/MatrixProvider";
import { useMatrixSnapshot } from "./useMatrixSnapshot";
import { usePreferences } from "../usePreferences";
import { useMemo, useSyncExternalStore } from "react";
import { blockedUsers } from "../../../domain/settings/BlockedUsers";

export function useMatrixTimeline(roomId: string | null) {
  const prefs = usePreferences();
  const ignored = useSyncExternalStore(blockedUsers.subscribe, blockedUsers.getSnapshot, blockedUsers.getSnapshot);
  const runtime = useMatrixRuntime();
  const snapshot = useMatrixSnapshot();
  const actions = useMemo(() => ({
    loadOlder: () => (roomId ? runtime.loadOlder(roomId) : Promise.resolve(false)),
    sendMessage: (body: string, replyToEventId?: string) =>
      roomId ? runtime.sendMessage(roomId, body, replyToEventId) : Promise.resolve(),
    getUploadLimit: runtime.getUploadLimit,
    retryMessage: (eventId: string) => roomId ? runtime.retryMessage(roomId, eventId) : Promise.resolve(),
    cancelSend: (eventId: string) => roomId ? runtime.cancelSend(roomId, eventId) : Promise.resolve(),
    sendAttachment: (file: File, onProgress?: (percent: number) => void, replyToEventId?: string) =>
      roomId ? runtime.sendAttachment(roomId, file, onProgress, replyToEventId) : Promise.reject(new Error("Select a room first.")),
    editMessage: (message: Parameters<typeof runtime.editMessage>[1], body: string) =>
      roomId ? runtime.editMessage(roomId, message, body) : Promise.resolve(),
    deleteMessage: (message: Parameters<typeof runtime.deleteMessage>[1]) =>
      roomId ? runtime.deleteMessage(roomId, message) : Promise.resolve(),
    togglePin: (message: Parameters<typeof runtime.setMessagePinned>[1]) =>
      roomId ? runtime.setMessagePinned(roomId, message) : Promise.resolve(),
    setTyping: (typing: boolean) => {
      if (roomId) runtime.setTyping(roomId, typing && prefs.sendTyping);
    },
    toggleReaction: (message: Parameters<typeof runtime.toggleReaction>[1], key: string) =>
      roomId ? runtime.toggleReaction(roomId, message, key) : Promise.resolve(),
  }), [runtime, roomId, prefs.sendTyping]);
  return {
    members: roomId ? runtime.getRoomMembers(roomId).filter(member => member.membership === "join" && !ignored.has(member.id))
      .map(member => ({ ...member, presence: snapshot.presences[member.id] ?? member.presence ?? "unknown" })) : [],
    messages: roomId ? (snapshot.timelines[roomId] ?? []).filter((message) => !ignored.has(message.sender.id)) : [],
    typingMembers: roomId ? (snapshot.typing[roomId] ?? []).filter((member) => !ignored.has(member.id)) : [],
    ...actions,
  };
}
