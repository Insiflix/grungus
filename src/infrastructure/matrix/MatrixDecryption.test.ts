import { describe, expect, it, vi } from "vitest";
import { MatrixEvent, type MatrixClient } from "matrix-js-sdk";
import { DecryptionFailureCode as Failure } from "matrix-js-sdk/lib/crypto-api";
import { DecryptionError, type CryptoBackend } from "matrix-js-sdk/lib/common-crypto/CryptoBackend";
import { decryptionFailureMessage, retryFailedDecryption } from "./MatrixDecryption";

function fixture() {
  const event = new MatrixEvent({ event_id: "$message", room_id: "!room:test", sender: "@sender:test", type: "m.room.encrypted", content: { algorithm: "m.megolm.v1.aes-sha2" } });
  const decryptEvent = vi.fn().mockRejectedValue(new DecryptionError(Failure.MEGOLM_UNKNOWN_INBOUND_SESSION_ID, "Missing room key"));
  const backend = { decryptEvent } as unknown as CryptoBackend;
  const client = { getCrypto: () => backend, decryptEventIfNeeded: vi.fn() } as unknown as MatrixClient;
  return { event, decryptEvent, backend, client };
}

describe("failed message decryption", () => {
  it("retries a failed SDK event even when decryptEventIfNeeded would skip its error placeholder", async () => {
    const { event, decryptEvent, backend, client } = fixture();
    await event.attemptDecryption(backend);
    expect(event.isDecryptionFailure()).toBe(true);
    expect(event.shouldAttemptDecryption()).toBe(false);
    decryptEvent.mockResolvedValueOnce({ clearEvent: { type: "m.room.message", content: { msgtype: "m.text", body: "hello" } } });
    await retryFailedDecryption(client, event);
    expect(event.isDecryptionFailure()).toBe(false);
    expect(event.getContent().body).toBe("hello");
    expect(decryptEvent).toHaveBeenCalledTimes(2);
  });
  it("reports missing keys without marking ciphertext as decrypted", async () => {
    const { event, backend, client } = fixture();
    await event.attemptDecryption(backend);
    await expect(retryFailedDecryption(client, event)).rejects.toThrow("has not shared the encryption key");
    expect(event.isDecryptionFailure()).toBe(true);
  });
  it("keeps identity verification failures distinct from missing keys", () => {
    expect(decryptionFailureMessage(Failure.SENDER_IDENTITY_PREVIOUSLY_VERIFIED)).toContain("identity changed");
    expect(decryptionFailureMessage(Failure.MEGOLM_KEY_WITHHELD_FOR_UNVERIFIED_DEVICE)).toContain("Verify this device");
    expect(decryptionFailureMessage(Failure.HISTORICAL_MESSAGE_USER_NOT_JOINED)).toContain("before you joined");
  });
  it("never retries messages sent before joining", async () => {
    const { event, decryptEvent, backend, client } = fixture();
    decryptEvent.mockRejectedValue(new DecryptionError(Failure.HISTORICAL_MESSAGE_USER_NOT_JOINED, "Not a member"));
    await event.attemptDecryption(backend);
    await expect(retryFailedDecryption(client, event)).rejects.toThrow("before you joined");
    expect(decryptEvent).toHaveBeenCalledOnce();
  });
});
