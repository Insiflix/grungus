import { useSyncExternalStore } from "react";
import { blockedUsers } from "../../domain/settings/BlockedUsers";
export function useBlockedUsers() {
  return useSyncExternalStore(blockedUsers.subscribe, blockedUsers.getSnapshot, blockedUsers.getSnapshot);
}
export function useIsBlocked(userId?: string) {
  const blocked = useBlockedUsers();
  return Boolean(userId && blocked.has(userId));
}
