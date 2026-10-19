import type { Room } from "matrix-js-sdk";

// Outgoing direct invites are recorded on the other member, not on ourselves.
export function directInvitePeer(room: Room, ownUserId: string | null | undefined): string | undefined {
  const inviter = room.getDMInviter?.();
  if (inviter && inviter !== ownUserId) return inviter;
  if (!ownUserId) return undefined;
  return room.getMembers?.().find(member => member.userId !== ownUserId &&
    (member.membership === "join" || member.membership === "invite") && member.getDMInviter?.() === ownUserId)?.userId;
}
