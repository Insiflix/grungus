import { Ban } from "lucide-react";
import { useIsBlocked } from "../../hooks/useBlockedUsers";
export function BlockedUserBadge({ userId }: { userId?: string }) {
  const blocked = useIsBlocked(userId);
  return blocked ? <span className="blocked-user-badge" data-tooltip="Blocked user" aria-label="Blocked user"><Ban size={11} aria-hidden="true" />Blocked</span> : null;
}
