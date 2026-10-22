import { membershipChange } from "./MatrixMembershipChanges";
import { M_POLL_RESPONSE, M_POLL_END, EventType, MsgType, RelationType, type MatrixEvent } from "matrix-js-sdk";
import { isCallSignallingEvent } from "./MatrixCallSignalling";

export function isHiddenTimelineEvent(event: MatrixEvent): boolean {
  // The crypto SDK still receives these events; only their chat rendering is hidden.
  if (event.getType().startsWith("m.key.verification.") ||
      (event.getType() === EventType.RoomMessage && event.getContent().msgtype === MsgType.KeyVerificationRequest)) return true;
  if (event.getType() === EventType.RoomMember) return membershipChange(event) === null;
  return M_POLL_RESPONSE.matches(event.getType()) || M_POLL_END.matches(event.getType()) || event.isState() || isCallSignallingEvent(event.getType()) ||
    event.getType() === EventType.Reaction || event.getType() === EventType.RoomRedaction ||
    event.getRelation()?.rel_type === RelationType.Replace;
}
