import type { MatrixClient } from "matrix-js-sdk";
import { CryptoEvent, type UserVerificationStatus } from "matrix-js-sdk/lib/crypto-api";
import type { MatrixPeerVerification } from "../../domain/matrix/MatrixTypes";

export function observePeerVerification(client: MatrixClient, userId: string, listener: (status: MatrixPeerVerification) => void, current = () => true): () => void {
  let active = true, revision = 0;
  const publish = (status: UserVerificationStatus) => {
    if (active && current()) listener(status.needsUserApproval || (status.wasCrossSigningVerified() && !status.isVerified()) ? "changed" : status.isVerified() ? "verified" : "unverified");
  };
  const changed = (id: string, status: UserVerificationStatus) => {
    if (id !== userId) return;
    revision++; publish(status);
  };
  client.on(CryptoEvent.UserTrustStatusChanged, changed);
  const crypto = client.getCrypto();
  if (crypto) void crypto.getUserVerificationStatus(userId).then(status => { if (revision === 0) publish(status); }).catch(() => { if (active && current() && revision === 0) listener("unavailable"); });
  else listener("unavailable");
  return () => { active = false; client.off(CryptoEvent.UserTrustStatusChanged, changed); };
}
