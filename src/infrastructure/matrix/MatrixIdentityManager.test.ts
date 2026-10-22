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
    requestVerificationDM: vi.fn(),
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
    await expect(manager.callbacks.getSecretStorageKey!({ keys: { "old-key": keyInfo } }, "secret")).rejects.toThrow("recovery key");
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
    expect(manager.getSnapshot().notice).toContain("12 message keys");
    await expect(manager.callbacks.getSecretStorageKey!({ keys: { storage: keyInfo } }, "secret")).rejects.toThrow("recovery key");
  });

  it("rejects wrong recovery keys without touching identity or backups", async () => {
    const { manager, crypto, storage } = setup();
    storage.checkKey.mockResolvedValueOnce(false);
    await expect(manager.recover(recoveryKey())).rejects.toThrow("does not belong");
    expect(crypto.bootstrapCrossSigning).not.toHaveBeenCalled();
    expect(crypto.resetEncryption).not.toHaveBeenCalled();
  });

  it("never falls back to resetting identity when saved cross-signing secrets are missing", async () => {
    const { manager, crypto, storage } = setup();
    storage.get.mockResolvedValueOnce("");
    await expect(manager.recover(recoveryKey())).rejects.toThrow("identity keys are missing");
    expect(crypto.bootstrapCrossSigning).not.toHaveBeenCalled();
    expect(crypto.resetEncryption).not.toHaveBeenCalled();
  });

  it("requires preparing and confirming a key before the destructive reset", async () => {
    const { manager, crypto, generated } = setup();
    await expect(manager.reset(true)).rejects.toThrow("Save the new key");
    await manager.prepareReset();
    expect(manager.getSnapshot().newRecoveryKey).toBe(generated.encodedPrivateKey);
    expect(crypto.resetEncryption).not.toHaveBeenCalled();
    await expect(manager.reset(false)).rejects.toThrow("confirm");
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

  it("omits authentication on the initial upload for servers that reject an empty auth object", async () => {
    const { manager, crypto } = setup();
    const makeRequest = vi.fn(async (auth: unknown) => {
      if (auth !== null) throw { httpStatus: 400, data: { error: "deserialization failed: missing field `session`" } };
    });
    crypto.resetEncryption.mockImplementationOnce(async (auth) => { await (auth as (request: typeof makeRequest) => Promise<void>)(makeRequest); });
    await manager.prepareReset();
    await manager.reset(true);
    expect(makeRequest).toHaveBeenCalledExactlyOnceWith(null);
    expect(manager.getSnapshot().resetComplete).toBe(true);
  });

  it("retries dummy authentication with the server-issued session", async () => {
    const { manager, crypto } = setup();
    const makeRequest = vi.fn().mockRejectedValueOnce({ httpStatus: 401, data: { session: "dummy-session", flows: [{ stages: ["m.login.dummy"] }] } }).mockResolvedValueOnce(undefined);
    crypto.resetEncryption.mockImplementationOnce(async (auth) => { await (auth as (request: typeof makeRequest) => Promise<void>)(makeRequest); });
    await manager.prepareReset();
    await manager.reset(true);
    expect(makeRequest).toHaveBeenNthCalledWith(1, null);
    expect(makeRequest).toHaveBeenNthCalledWith(2, { session: "dummy-session", type: "m.login.dummy" });
    expect(manager.getSnapshot().resetComplete).toBe(true);
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
    expect(makeRequest).toHaveBeenNthCalledWith(1, null);
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
    const failure = expect(reset).rejects.toThrow("cancelled");
    await vi.waitFor(() => expect(manager.getSnapshot().auth?.url).toContain("/auth/m.login.sso/fallback/web?session=auth-session"));
    manager.cancelAuth(); await failure;
    expect(crypto.bootstrapSecretStorage).not.toHaveBeenCalled();
    expect(manager.getSnapshot().busy).toBe(false);
  });
});

describe("SAS device verification", () => {
  it("requests peer verification through a DM and requires an explicit SAS match", async () => {
    const { manager, crypto } = setup();
    const { request, verifier, sas } = verification();
    request.otherUserId = "@alice:example.org";
    crypto.requestVerificationDM.mockResolvedValueOnce(request);
    await manager.requestUserVerification(request.otherUserId, async () => "!dm:example.org");
    expect(crypto.requestVerificationDM).toHaveBeenCalledExactlyOnceWith("@alice:example.org", "!dm:example.org");
    expect(crypto.requestOwnUserVerification).not.toHaveBeenCalled();
    expect(manager.getSnapshot().verification).toMatchObject({ userId: request.otherUserId, incoming: false, phase: "requested" });
    await manager.startComparison();
    verifier.emit(VerifierEvent.ShowSas, sas);
    expect(sas.confirm).not.toHaveBeenCalled();
    await manager.confirmComparison(true);
    expect(sas.confirm).toHaveBeenCalledOnce();
    request.phase = VerificationPhase.Done; request.pending = false; request.emit(VerificationRequestEvent.Change);
    expect(manager.getSnapshot().verification?.phase).toBe("done");
  });

  it("does not create a DM while another verification is active", async () => {
    const { manager, client } = setup();
    client.emit(CryptoEvent.VerificationRequestReceived, verification(true).request);
    const room = vi.fn(async () => "!dm:example.org");
    await expect(manager.requestUserVerification("@alice:example.org", room)).rejects.toThrow("already in progress");
    expect(room).not.toHaveBeenCalled();
  });

  it("does not send a peer request if the account changes while opening a DM", async () => {
    const { manager, crypto } = setup();
    let finish!: (roomId: string) => void;
    const sending = manager.requestUserVerification("@alice:example.org", () => new Promise(resolve => { finish = resolve; }));
    manager.dispose(); finish("!dm:example.org");
    await expect(sending).rejects.toThrow("session changed");
    expect(crypto.requestVerificationDM).not.toHaveBeenCalled();
    expect(manager.getSnapshot().verification).toBeNull();
  });

  it("cancels an outgoing peer request that completes after logout", async () => {
    const { manager, crypto } = setup();
    const { request } = verification();
    let finish!: (value: typeof request) => void;
    crypto.requestVerificationDM.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const sending = manager.requestUserVerification("@alice:example.org", async () => "!dm:example.org");
    await vi.waitFor(() => expect(crypto.requestVerificationDM).toHaveBeenCalled());
    manager.dispose(); finish(request);
    await expect(sending).rejects.toThrow("session changed");
    expect(request.cancel).toHaveBeenCalledOnce();
    expect(manager.getSnapshot().verification).toBeNull();
  });

  it("keeps an incoming peer request when one arrives while the DM is opening", async () => {
    const { manager, crypto, client } = setup();
    const { request } = verification(true);
    request.otherUserId = "@bob:example.org";
    await expect(manager.requestUserVerification("@alice:example.org", async () => {
      client.emit(CryptoEvent.VerificationRequestReceived, request);
      return "!dm:example.org";
    })).rejects.toThrow("already in progress");
    expect(crypto.requestVerificationDM).not.toHaveBeenCalled();
    expect(manager.getSnapshot().verification?.userId).toBe("@bob:example.org");
  });

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
