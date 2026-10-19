import { EventType, RelationType, type MatrixEvent } from "matrix-js-sdk";
import { isCallSignallingEvent } from "./MatrixCallSignalling";

export function isHiddenTimelineEvent(event: MatrixEvent): boolean {
  return event.isState() || isCallSignallingEvent(event.getType()) ||
    event.getType() === EventType.Reaction || event.getType() === EventType.RoomRedaction ||
    event.getRelation()?.rel_type === RelationType.Replace;
}
