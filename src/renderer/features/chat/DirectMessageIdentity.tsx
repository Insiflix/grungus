import { useEffect, useState } from "react";
import { ShieldCheck, ShieldAlert, ShieldQuestion } from "lucide-react";
import type { MatrixPeerVerification, MatrixRoom, MatrixRoomMember } from "../../../domain/matrix/MatrixTypes";
import { useMatrixRuntime } from "../../app/providers/MatrixProvider";
import { Avatar } from "../../components/common/Avatar";
import { presenceLabels } from "../../components/common/PresenceStatus";
import { BlockedUserBadge } from "../../components/common/BlockedUserBadge";

export function DirectMessageIdentity({ room, members }: { room: MatrixRoom; members: MatrixRoomMember[] }) {
  const runtime = useMatrixRuntime();
  const peerId = room.directUserId ?? members.find(member => member.id !== runtime.getSnapshot().session?.userId)?.id;
  const peer = members.find(member => member.id === peerId);
  const [verification, setVerification] = useState<{ userId: string; status: MatrixPeerVerification } | null>(null);
  useEffect(() => {
    if (!peerId) return;
    try { return runtime.observeUserVerification(peerId, status => setVerification({ userId: peerId, status })); }
    catch { setVerification({ userId: peerId, status: "unavailable" }); }
  }, [runtime, peerId]);
  const status = verification?.userId === peerId ? verification?.status : undefined;
  const label = status === "verified" ? "Verified" : status === "changed" ? "Identity changed" : status === "unverified" ? "Not verified" : status === "unavailable" ? "Verification unavailable" : "Checking verification...";
  const Icon = status === "verified" ? ShieldCheck : status === "changed" ? ShieldAlert : ShieldQuestion;
  return <>
    <Avatar name={room.name} url={peer?.avatarUrl ?? room.avatarUrl} presence={peer?.presence ?? "unknown"} />
    <div className="dm-header-identity"><h1><span className="user-name-label">{room.name}</span><BlockedUserBadge userId={peerId} /></h1>
      <div className="dm-header-identity__status"><span>{presenceLabels[peer?.presence ?? "unknown"]}</span><span className={`peer-verification peer-verification--${status ?? "checking"}`} data-tooltip={`${peerId ?? room.name}: ${label}`}><Icon size={13} aria-hidden="true" />{label}</span></div>
      {room.topic && <p>{room.topic}</p>}
    </div>
  </>;
}
