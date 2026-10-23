import type { MatrixClient, MatrixEvent } from "matrix-js-sdk";
import { DecryptionFailureCode as Failure } from "matrix-js-sdk/lib/crypto-api";
import type { CryptoBackend } from "matrix-js-sdk/lib/common-crypto/CryptoBackend";

export function decryptionFailureMessage(reason: string | null | undefined): string {
  switch (reason) {
    case Failure.MEGOLM_UNKNOWN_INBOUND_SESSION_ID:
      return "The sender's device has not shared the encryption key for this message yet.";
    case Failure.OLM_UNKNOWN_MESSAGE_INDEX:
      return "The available encryption key cannot unlock this older message.";
    case Failure.MEGOLM_KEY_WITHHELD_FOR_UNVERIFIED_DEVICE:
      return "The sender requires a verified device. Verify this device under Identity & encryption.";
    case Failure.MEGOLM_KEY_WITHHELD:
      return "The sender's device refused to share this message's encryption key.";
    case Failure.HISTORICAL_MESSAGE_USER_NOT_JOINED:
      return "Message sent before you joined.";
    case Failure.HISTORICAL_MESSAGE_NO_KEY_BACKUP:
    case Failure.HISTORICAL_MESSAGE_BACKUP_UNCONFIGURED:
      return "This message predates this device. Restore your message keys under Identity & encryption.";
    case Failure.HISTORICAL_MESSAGE_WORKING_BACKUP:
      return "Waiting for this message's encryption key from your backup.";
    case Failure.SENDER_IDENTITY_PREVIOUSLY_VERIFIED:
      return "The sender's encryption identity changed. Review their identity before reading this message.";
    case Failure.UNKNOWN_SENDER_DEVICE:
    case Failure.UNSIGNED_SENDER_DEVICE:
      return "The sender's device cannot be verified. Ask them to verify it under Identity & encryption.";
    default:
      return "Unable to decrypt this message. Retry after both devices have finished syncing.";
  }
}

export function canRetryDecryption(reason: string | null | undefined): boolean {
  return reason !== Failure.HISTORICAL_MESSAGE_USER_NOT_JOINED;
}

export async function retryFailedDecryption(client: MatrixClient, event: MatrixEvent): Promise<void> {
  if (!event.isDecryptionFailure()) return;
  if (!canRetryDecryption(event.decryptionFailureReason)) throw new Error(decryptionFailureMessage(event.decryptionFailureReason));
  const crypto = client.getCrypto();
  // decryptEventIfNeeded skips failed events because they already have a clear
  // error placeholder. Use the same retry path as SDK room-key delivery.
  if (!crypto || !("decryptEvent" in crypto) || typeof crypto.decryptEvent !== "function") {
    throw new Error("Encryption is not ready. Please wait for synchronization.");
  }
  await event.attemptDecryption(crypto as CryptoBackend, { isRetry: true });
  if (event.isDecryptionFailure()) throw new Error(decryptionFailureMessage(event.decryptionFailureReason));
}
