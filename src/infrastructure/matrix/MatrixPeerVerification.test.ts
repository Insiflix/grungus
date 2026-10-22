import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import type { MatrixClient } from "matrix-js-sdk";
import { CryptoEvent, UserVerificationStatus } from "matrix-js-sdk/lib/crypto-api";
import { observePeerVerification } from "./MatrixPeerVerification";

function fixture() {
  let finish!: (value: UserVerificationStatus) => void;
  const getUserVerificationStatus = vi.fn(() => new Promise<UserVerificationStatus>(resolve => { finish = resolve; }));
  const client = Object.assign(new EventEmitter(), { getCrypto: () => ({ getUserVerificationStatus }) });
  const listener = vi.fn();
  const dispose = observePeerVerification(client as unknown as MatrixClient, "@peer:test", listener);
  return { client, getUserVerificationStatus, listener, dispose, finish: (status: UserVerificationStatus) => finish(status) };
}
describe("peer identity verification", () => {
  it("reads the peer identity and does not confuse first-use trust with verification", async () => {
    const f = fixture();
    expect(f.getUserVerificationStatus).toHaveBeenCalledWith("@peer:test");
    f.finish(new UserVerificationStatus(false, false, true)); await Promise.resolve();
    expect(f.listener).toHaveBeenLastCalledWith("unverified");
    f.client.emit(CryptoEvent.UserTrustStatusChanged, "@peer:test", new UserVerificationStatus(true, true, true));
    expect(f.listener).toHaveBeenLastCalledWith("verified");
    f.client.emit(CryptoEvent.UserTrustStatusChanged, "@peer:test", new UserVerificationStatus(false, true, true, true));
    expect(f.listener).toHaveBeenLastCalledWith("changed");
    f.dispose();
  });
  it("ignores other users, stale reads and callbacks after disposal", async () => {
    const f = fixture();
    f.client.emit(CryptoEvent.UserTrustStatusChanged, "@other:test", new UserVerificationStatus(true, true, true));
    expect(f.listener).not.toHaveBeenCalled();
    f.client.emit(CryptoEvent.UserTrustStatusChanged, "@peer:test", new UserVerificationStatus(true, true, true));
    f.finish(new UserVerificationStatus(false, false, true)); await Promise.resolve();
    expect(f.listener).toHaveBeenCalledTimes(1);
    expect(f.listener).toHaveBeenLastCalledWith("verified");
    f.dispose();
    expect(f.client.listenerCount(CryptoEvent.UserTrustStatusChanged)).toBe(0);
    f.client.emit(CryptoEvent.UserTrustStatusChanged, "@peer:test", new UserVerificationStatus(false, false, true));
    expect(f.listener).toHaveBeenCalledTimes(1);
  });
  it("reports crypto unavailability without claiming the peer is verified", () => {
    const listener = vi.fn();
    const client = Object.assign(new EventEmitter(), { getCrypto: () => undefined });
    const dispose = observePeerVerification(client as unknown as MatrixClient, "@peer:test", listener);
    expect(listener).toHaveBeenCalledWith("unavailable"); dispose();
  });
});
