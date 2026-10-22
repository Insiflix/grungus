import type { MatrixClient } from "matrix-js-sdk";
import { CryptoEvent, type UserVerificationStatus } from "matrix-js-sdk/lib/crypto-api";
import type { MatrixPeerVerification } from "../../domain/matrix/MatrixTypes";

export async function acceptPeerIdentity(client: MatrixClient, userId: string, assertCurrent = () => {}): Promise<void> {
  if (userId === client.getUserId()) throw new Error("You cannot accept your own identity here.");
  const crypto = client.getCrypto();
  if (!crypto) throw new Error("Encryption is not ready. Please try again.");
  const status = await crypto.getUserVerificationStatus(userId);
  assertCurrent();
  if (status.wasCrossSigningVerified() && !status.isVerified()) {
    await crypto.withdrawVerificationRequirement(userId);
  } else if (status.needsUserApproval) {
    await crypto.pinCurrentUserIdentity(userId);
  }
  assertCurrent();
  const updated = await crypto.getUserVerificationStatus(userId);
  assertCurrent();
  client.emit(CryptoEvent.UserTrustStatusChanged, userId, updated);
}

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
