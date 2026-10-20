import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import type { MatrixClient } from "matrix-js-sdk";
import {
  CryptoEvent, encodeRecoveryKey, VerificationPhase, VerificationRequestEvent, VerifierEvent,
  type CreateSecretStorageOpts, type ShowSasCallbacks, type VerificationRequest,
} from "matrix-js-sdk/lib/crypto-api";
import { MatrixIdentityManager } from "./MatrixIdentityManager";

const keyInfo = { algorithm: "m.secret_storage.v1.aes-hmac-sha2", name: "Test key", iv: "iv", mac: "mac", passphrase: { algorithm: "m.pbkdf2" as const, iterations: 1, salt: "salt" } };
const recoveryKey = () => encodeRecoveryKey(new Uint8Array(32).fill(3))!;

function setup() {
  const emitted = vi.fn();
  const manager = new MatrixIdentityManager(emitted);
  const client = new EventEmitter();
  const generated = { privateKey: new Uint8Array(32).fill(9), encodedPrivateKey: encodeRecoveryKey(new Uint8Array(32).fill(9)) };
  const crypto = {
    getCrossSigningStatus: vi.fn(async () => ({ publicKeysOnDevice: true })),
    getDeviceVerificationStatus: vi.fn(async () => ({ isVerified: () => false })),
    getSecretStorageStatus: vi.fn(async () => ({ defaultKeyId: "storage" })),
    bootstrapCrossSigning: vi.fn(async () => undefined),
    getKeyBackupInfo: vi.fn(async () => ({ version: "1" })),
    loadSessionBackupPrivateKeyFromSecretStorage: vi.fn(async () => undefined),
    restoreKeyBackup: vi.fn(async () => ({ imported: 12 })),
    checkKeyBackupAndEnable: vi.fn(async () => null),
    createRecoveryKeyFromPassphrase: vi.fn(async () => generated),
    resetEncryption: vi.fn(async (_auth: unknown) => undefined),
    bootstrapSecretStorage: vi.fn(async (options: CreateSecretStorageOpts) => {
      const key = await options.createSecretStorageKey!();
      manager.callbacks.cacheSecretStorageKey!("new-storage", keyInfo, key.privateKey);
    }),
    requestOwnUserVerification: vi.fn(),
  };
  const storage = {
    getDefaultKeyId: vi.fn(async () => "storage"),
    getKey: vi.fn(async () => ["storage", { algorithm: "m.secret_storage.v1.aes-hmac-sha2" }]),
    checkKey: vi.fn(async () => true),
    get: vi.fn(async () => "private-key"),
  };
  Object.assign(client, { getCrypto: () => crypto, secretStorage: storage,
    getUserId: () => "@me:example.org", getDeviceId: () => "DEVICE", getHomeserverUrl: () => "https://example.org" });
  manager.attach(client as unknown as MatrixClient);
  return { manager, crypto, storage, client, generated };
}

function verification(incoming = false) {
  const sas: ShowSasCallbacks = { sas: { emoji: [["🐶", "Dog"], ["🌳", "Tree"]] }, confirm: vi.fn(async () => undefined), mismatch: vi.fn(), cancel: vi.fn() };
  const verifier = Object.assign(new EventEmitter(), {
    verify: vi.fn(() => new Promise<void>(() => undefined)), getShowSasCallbacks: () => null,
  });
  const request = Object.assign(new EventEmitter(), {
    otherUserId: "@me:example.org", otherDeviceId: "OTHER", initiatedByMe: !incoming,
    phase: VerificationPhase.Requested, pending: true, verifier: undefined as unknown,
    accept: vi.fn(async () => { request.phase = VerificationPhase.Ready; request.emit(VerificationRequestEvent.Change); }),
    startVerification: vi.fn(async () => { request.verifier = verifier; request.phase = VerificationPhase.Started; request.emit(VerificationRequestEvent.Change); return verifier; }),
    cancel: vi.fn(async () => { request.phase = VerificationPhase.Cancelled; request.pending = false; request.emit(VerificationRequestEvent.Change); }),
  });
  return { request, verifier, sas };
}

describe("identity recovery and reset", () => {
  it("invalidates secret callbacks from an ended account", async () => {
    const { manager, client } = setup();
    const stale = manager.callbacks;
    manager.dispose(); manager.attach(client as unknown as MatrixClient);
    stale.cacheSecretStorageKey!("old-key", keyInfo, new Uint8Array(32));
    await expect(stale.getSecretStorageKey!({ keys: { "old-key": keyInfo } }, "secret")).rejects.toThrow("ended");
    await expect(manager.callbacks.getSecretStorageKey!({ keys: { "old-key": keyInfo } }, "secret")).rejects.toThrow("Wiederherstellung");
  });
  it("discards and zeroes a recovery key generated after logout", async () => {
    const { manager, crypto, generated } = setup();
    let finish!: (value: typeof generated) => void;
    crypto.createRecoveryKeyFromPassphrase.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const preparing = manager.prepareReset();
    manager.dispose(); finish(generated);
    await expect(preparing).rejects.toThrow("changed");
    expect(manager.getSnapshot().newRecoveryKey).toBeNull();
    expect([...generated.privateKey].every(byte => byte === 0)).toBe(true);
  });
  it("checks a recovery key before restoring cross-signing and message keys", async () => {
    const { manager, crypto, storage } = setup();
    await manager.recover(recoveryKey());
    expect(storage.checkKey).toHaveBeenCalled();
    expect(crypto.bootstrapCrossSigning).toHaveBeenCalledWith({});
    expect(crypto.resetEncryption).not.toHaveBeenCalled();
    expect(crypto.restoreKeyBackup).toHaveBeenCalledOnce();
    expect(manager.getSnapshot().notice).toContain("12 Nachrichtenschlüssel");
    await expect(manager.callbacks.getSecretStorageKey!({ keys: { storage: keyInfo } }, "secret")).rejects.toThrow("Wiederherstellungsschlüssel");
  });

  it("rejects wrong recovery keys without touching identity or backups", async () => {
    const { manager, crypto, storage } = setup();
    storage.checkKey.mockResolvedValueOnce(false);
    await expect(manager.recover(recoveryKey())).rejects.toThrow("gehört nicht");
    expect(crypto.bootstrapCrossSigning).not.toHaveBeenCalled();
    expect(crypto.resetEncryption).not.toHaveBeenCalled();
  });

  it("never falls back to resetting identity when saved cross-signing secrets are missing", async () => {
    const { manager, crypto, storage } = setup();
    storage.get.mockResolvedValueOnce("");
    await expect(manager.recover(recoveryKey())).rejects.toThrow("Identitätsschlüssel fehlen");
    expect(crypto.bootstrapCrossSigning).not.toHaveBeenCalled();
    expect(crypto.resetEncryption).not.toHaveBeenCalled();
  });

  it("requires preparing and confirming a key before the destructive reset", async () => {
    const { manager, crypto, generated } = setup();
    await expect(manager.reset(true)).rejects.toThrow("zuerst");
    await manager.prepareReset();
    expect(manager.getSnapshot().newRecoveryKey).toBe(generated.encodedPrivateKey);
    expect(crypto.resetEncryption).not.toHaveBeenCalled();
    await expect(manager.reset(false)).rejects.toThrow("bestätigen");
    await manager.reset(true);
    expect(crypto.resetEncryption).toHaveBeenCalledOnce();
    expect(crypto.bootstrapSecretStorage).toHaveBeenCalledWith(expect.objectContaining({ setupNewSecretStorage: true, setupNewKeyBackup: false }));
    expect(manager.getSnapshot().resetComplete).toBe(true);
    // Keep the printable recovery key available until the user dismisses it.
    expect(manager.getSnapshot().newRecoveryKey).toBe(generated.encodedPrivateKey);
    manager.clearSecrets();
    expect(manager.getSnapshot().newRecoveryKey).toBeNull();
    expect([...generated.privateKey].every((byte) => byte === 0)).toBe(true);
  });

  it("resumes reset using user-entered UI authentication without exposing the password in state", async () => {
    const { manager, crypto } = setup();
    const makeRequest = vi.fn().mockRejectedValueOnce({ httpStatus: 401, data: { session: "auth-session", flows: [{ stages: ["m.login.password"] }] } }).mockResolvedValueOnce(undefined);
    crypto.resetEncryption.mockImplementationOnce(async (auth) => { await (auth as (request: typeof makeRequest) => Promise<void>)(makeRequest); });
    await manager.prepareReset();
    const reset = manager.reset(true);
    await vi.waitFor(() => expect(manager.getSnapshot().auth?.stage).toBe("m.login.password"));
    manager.submitAuth("test-password");
    await reset;
    expect(makeRequest).toHaveBeenLastCalledWith({ session: "auth-session", type: "m.login.password", identifier: { type: "m.id.user", user: "@me:example.org" }, password: "test-password" });
    expect(JSON.stringify(manager.getSnapshot())).not.toContain("test-password");
    expect(manager.getSnapshot().auth).toBeNull();
  });

  it("cleans up a cancelled authentication prompt instead of continuing the reset", async () => {
    const { manager, crypto } = setup();
    const makeRequest = vi.fn().mockRejectedValue({ httpStatus: 401, data: { session: "auth-session", flows: [{ stages: ["m.login.sso"] }] } });
    crypto.resetEncryption.mockImplementationOnce(async (auth) => { await (auth as (request: typeof makeRequest) => Promise<void>)(makeRequest); });
    await manager.prepareReset();
    const reset = manager.reset(true);
    const failure = expect(reset).rejects.toThrow("abgebrochen");
    await vi.waitFor(() => expect(manager.getSnapshot().auth?.url).toContain("/auth/m.login.sso/fallback/web?session=auth-session"));
    manager.cancelAuth(); await failure;
    expect(crypto.bootstrapSecretStorage).not.toHaveBeenCalled();
    expect(manager.getSnapshot().busy).toBe(false);
  });
});

describe("SAS device verification", () => {
  it("shows a comparison and waits for an explicit match confirmation", async () => {
    const { manager, crypto } = setup();
    const { request, verifier, sas } = verification();
    crypto.requestOwnUserVerification.mockResolvedValueOnce(request);
    await manager.requestVerification();
    request.phase = VerificationPhase.Ready; request.emit(VerificationRequestEvent.Change);
    await manager.startComparison();
    verifier.emit(VerifierEvent.ShowSas, sas);
    expect(manager.getSnapshot().verification?.emoji).toEqual(sas.sas.emoji);
    expect(sas.confirm).not.toHaveBeenCalled();
    await manager.confirmComparison(true);
    expect(sas.confirm).toHaveBeenCalledOnce();
    expect(manager.getSnapshot().verified).toBe(false);
    request.phase = VerificationPhase.Done; request.pending = false; request.emit(VerificationRequestEvent.Change);
    expect(manager.getSnapshot().verification?.phase).toBe("done");
  });

  it("handles incoming requests and rejects mismatched comparisons", async () => {
    const { manager, client } = setup();
    const { request, verifier, sas } = verification(true);
    client.emit(CryptoEvent.VerificationRequestReceived, request as unknown as VerificationRequest);
    expect(manager.getSnapshot().verification?.incoming).toBe(true);
    await manager.acceptVerification(); await manager.startComparison();
    verifier.emit(VerifierEvent.ShowSas, sas);
    await manager.confirmComparison(false);
    expect(sas.mismatch).toHaveBeenCalledOnce();
    expect(sas.confirm).not.toHaveBeenCalled();
    await manager.cancelVerification();
    expect(manager.getSnapshot().verification?.phase).toBe("cancelled");
    manager.dispose();
    expect(client.listenerCount(CryptoEvent.VerificationRequestReceived)).toBe(0);
  });
});
