import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import type { MatrixClient } from "matrix-js-sdk";
import { CryptoEvent, UserVerificationStatus } from "matrix-js-sdk/lib/crypto-api";
import { acceptPeerIdentity, observePeerVerification } from "./MatrixPeerVerification";

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

describe("accepting a replacement identity", () => {
  function acceptanceFixture(status: UserVerificationStatus) {
    const crypto = {
      getUserVerificationStatus: vi.fn().mockResolvedValueOnce(status).mockResolvedValue(new UserVerificationStatus(false, false, true)),
      pinCurrentUserIdentity: vi.fn(async () => undefined),
      withdrawVerificationRequirement: vi.fn(async () => undefined),
    };
    const client = Object.assign(new EventEmitter(), { getUserId: () => "@self:test", getCrypto: () => crypto });
    const listener = vi.fn();
    client.on(CryptoEvent.UserTrustStatusChanged, listener);
    return { crypto, client: client as unknown as MatrixClient, listener };
  }
  it("pins a replacement identity and publishes the unverified status", async () => {
    const f = acceptanceFixture(new UserVerificationStatus(false, false, true, true));
    await acceptPeerIdentity(f.client, "@peer:test");
    expect(f.crypto.pinCurrentUserIdentity).toHaveBeenCalledWith("@peer:test");
    expect(f.crypto.withdrawVerificationRequirement).not.toHaveBeenCalled();
    expect(f.listener).toHaveBeenCalledWith("@peer:test", expect.objectContaining({ needsUserApproval: false }));
    expect(f.listener.mock.calls[0][1].isVerified()).toBe(false);
  });
  it("withdraws the old verification requirement for a previously verified contact", async () => {
    const f = acceptanceFixture(new UserVerificationStatus(false, true, true, true));
    await acceptPeerIdentity(f.client, "@peer:test");
    expect(f.crypto.withdrawVerificationRequirement).toHaveBeenCalledWith("@peer:test");
    expect(f.crypto.pinCurrentUserIdentity).not.toHaveBeenCalled();
  });
  it("preserves already verified identities", async () => {
    const f = acceptanceFixture(new UserVerificationStatus(true, true, true));
    await acceptPeerIdentity(f.client, "@peer:test");
    expect(f.crypto.withdrawVerificationRequirement).not.toHaveBeenCalled();
    expect(f.crypto.pinCurrentUserIdentity).not.toHaveBeenCalled();
  });
  it("propagates errors without publishing a successful acceptance", async () => {
    const f = acceptanceFixture(new UserVerificationStatus(false, false, true, true));
    f.crypto.pinCurrentUserIdentity.mockRejectedValueOnce(new Error("Could not accept identity"));
    await expect(acceptPeerIdentity(f.client, "@peer:test")).rejects.toThrow("Could not accept identity");
    expect(f.listener).not.toHaveBeenCalled();
  });
  it("rejects acceptance when encryption is unavailable or the session changes", async () => {
    const f = acceptanceFixture(new UserVerificationStatus(false, false, true, true));
    await expect(acceptPeerIdentity(f.client, "@peer:test", () => { throw new Error("Session changed"); })).rejects.toThrow("Session changed");
    expect(f.crypto.pinCurrentUserIdentity).not.toHaveBeenCalled();
    const unavailable = { getUserId: () => "@self:test", getCrypto: () => undefined } as unknown as MatrixClient;
    await expect(acceptPeerIdentity(unavailable, "@peer:test")).rejects.toThrow("Encryption is not ready");
    await expect(acceptPeerIdentity(f.client, "@self:test")).rejects.toThrow("own identity");
  });
});
