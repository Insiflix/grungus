import { EventType, type MatrixEvent } from "matrix-js-sdk";

export function membershipChange(event: MatrixEvent): "join" | "leave" | "remove" | "ban" | null {
  if (event.getType() !== EventType.RoomMember || event.isRedacted() || !event.getStateKey()) return null;
  const membership = event.getContent().membership;
  const previous = event.getPrevContent().membership;
  if (membership === "join" && previous !== "join") return "join";
  if (previous === "join" && membership === "ban") return "ban";
  if (previous === "join" && membership === "leave") return event.getSender() === event.getStateKey() ? "leave" : "remove";
  return null;
}
