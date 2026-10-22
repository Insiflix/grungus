import { useEffect, useSyncExternalStore } from "react";
import { LogIn, LogOut, X } from "lucide-react";
import { membershipNotices } from "../../../domain/matrix/MembershipNotices";

export function MembershipToast() {
  const notice = useSyncExternalStore(membershipNotices.subscribe, membershipNotices.getSnapshot, membershipNotices.getSnapshot);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => membershipNotices.clear(notice.id), 6000);
    return () => clearTimeout(timer);
  }, [notice]);
  if (!notice) return null;
  return <aside className="membership-toast" role="status" aria-live="polite">
    {notice.action === "join" ? <LogIn size={18} aria-hidden="true" /> : <LogOut size={18} aria-hidden="true" />}
    <span>{notice.action === "join" ? "Joined" : "Left"} {notice.kind} <strong>{notice.name}</strong></span>
    <button type="button" className="icon-button" aria-label="Dismiss membership notification" onClick={() => membershipNotices.clear(notice.id)}><X size={15} /></button>
  </aside>;
}
