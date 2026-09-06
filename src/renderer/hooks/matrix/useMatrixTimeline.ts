import { useMatrixRuntime } from "../../app/providers/MatrixProvider";
import { useMatrixSnapshot } from "./useMatrixSnapshot";

export function useMatrixTimeline(roomId: string | null) {
  const runtime = useMatrixRuntime();
  const snapshot = useMatrixSnapshot();
  return {
    messages: roomId ? (snapshot.timelines[roomId] ?? []) : [],
    typingMembers: roomId ? (snapshot.typing[roomId] ?? []) : [],
    loadOlder: () => (roomId ? runtime.loadOlder(roomId) : Promise.resolve(false)),
    sendMessage: (body: string) =>
      roomId ? runtime.sendMessage(roomId, body) : Promise.resolve(),
    setTyping: (typing: boolean) => {
      if (roomId) runtime.setTyping(roomId, typing);
    },
    toggleReaction: (message: Parameters<typeof runtime.toggleReaction>[1], key: string) =>
      roomId ? runtime.toggleReaction(roomId, message, key) : Promise.resolve(),
  };
}
