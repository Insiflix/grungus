import { useEffect, useState } from "react";
import { ShieldCheck, ShieldAlert, ShieldQuestion } from "lucide-react";
import type { MatrixPeerVerification, MatrixRoom, MatrixRoomMember } from "../../../domain/matrix/MatrixTypes";
import { useMatrixRuntime } from "../../app/providers/MatrixProvider";
import { Avatar } from "../../components/common/Avatar";
import { presenceLabels } from "../../components/common/PresenceStatus";
import { BlockedUserBadge } from "../../components/common/BlockedUserBadge";
import { AcceptPeerIdentityDialog } from "./AcceptPeerIdentityDialog";

export function DirectMessageIdentity({ room, members }: { room: MatrixRoom; members: MatrixRoomMember[] }) {
  const runtime = useMatrixRuntime();
  const peerId = room.directUserId ?? members.find(member => member.id !== runtime.getSnapshot().session?.userId)?.id;
  const peer = members.find(member => member.id === peerId);
  const [verification, setVerification] = useState<{ userId: string; status: MatrixPeerVerification } | null>(null);
  const [acceptingPeer, setAcceptingPeer] = useState<string | null>(null);
  useEffect(() => setAcceptingPeer(null), [peerId]);
  useEffect(() => {
    if (!peerId) return;
    try { return runtime.observeUserVerification(peerId, status => setVerification({ userId: peerId, status })); }
    catch { setVerification({ userId: peerId, status: "unavailable" }); }
  }, [runtime, peerId]);
  const status = verification?.userId === peerId ? verification?.status : undefined;
  const label = status === "verified" ? "Verified" : status === "changed" ? "Identity changed" : status === "unverified" ? "Not verified" : status === "unavailable" ? "Verification unavailable" : "Checking verification...";
  const Icon = status === "verified" ? ShieldCheck : status === "changed" ? ShieldAlert : ShieldQuestion;
  return <>
    <span data-profile-user-id={peerId} tabIndex={0}><Avatar name={room.name} url={peer?.avatarUrl ?? room.avatarUrl} presence={peer?.presence ?? "unknown"} /></span>
    <div className="dm-header-identity" data-profile-user-id={peerId}><h1><span className="user-name-label" tabIndex={0}>{room.name}</span><BlockedUserBadge userId={peerId} /></h1>
      <div className="dm-header-identity__status"><span>{presenceLabels[peer?.presence ?? "unknown"]}</span><span className={`peer-verification peer-verification--${status ?? "checking"}`} data-tooltip={`${peerId ?? room.name}: ${label}`}><Icon size={13} aria-hidden="true" />{label}</span>{status === "changed" && peerId && <button type="button" className="peer-verification__accept" onClick={() => setAcceptingPeer(peerId)}>Accept new identity</button>}</div>
      {room.topic && <p>{room.topic}</p>}
    </div>
    {acceptingPeer && acceptingPeer === peerId && <AcceptPeerIdentityDialog key={acceptingPeer} userId={acceptingPeer} name={peer?.displayName ?? room.name} avatarUrl={peer?.avatarUrl ?? room.avatarUrl} onAccept={() => runtime.acceptUserIdentity(acceptingPeer)} onClose={() => setAcceptingPeer(null)} />}
  </>;
}
