import type { MatrixClient } from "matrix-js-sdk";
import {
  CryptoEvent, decodeRecoveryKey, VerificationPhase, VerificationRequestEvent, VerifierEvent,
  type CryptoCallbacks, type GeneratedSecretStorageKey, type ShowSasCallbacks,
  type VerificationRequest, type Verifier,
} from "matrix-js-sdk/lib/crypto-api";
import type { AuthDict, UIAuthCallback } from "matrix-js-sdk/lib/interactive-auth";
import type { SecretStorageKeyDescriptionAesV1 } from "matrix-js-sdk/lib/secret-storage";
import type { MatrixIdentityState } from "../../domain/matrix/MatrixTypes";

export function emptyIdentityState(): MatrixIdentityState {
  return { available: false, deviceId: "", verified: false, hasIdentity: false, hasRecovery: false,
    busy: false, error: null, notice: null, newRecoveryKey: null, resetComplete: false, verification: null, auth: null };
}

export class MatrixIdentityManager {
  private state = emptyIdentityState();
  private client: MatrixClient | null = null;
  private request: VerificationRequest | null = null;
  private verifier: Verifier | null = null;
  private sas: ShowSasCallbacks | null = null;
  private recovery: GeneratedSecretStorageKey | null = null;
  private keys = new Map<string, Uint8Array<ArrayBuffer>>();
  private authInput: { resolve: (password?: string) => void; reject: (error: Error) => void } | null = null;

  constructor(private readonly changed: (state: MatrixIdentityState) => void) {}
  getSnapshot = () => this.state;

  readonly callbacks: CryptoCallbacks = {
    getSecretStorageKey: async ({ keys }) => {
      for (const id of Object.keys(keys)) {
        const key = this.keys.get(id);
        if (key) return [id, key];
      }
      throw new Error("Bitte den Wiederherstellungsschlüssel unter Identität & Verschlüsselung eingeben.");
    },
    cacheSecretStorageKey: (id, _info, key) => { this.keys.set(id, key); },
  };

  attach(client: MatrixClient) {
    this.client = client;
    client.on(CryptoEvent.VerificationRequestReceived, this.receiveRequest);
    client.on(CryptoEvent.UserTrustStatusChanged, this.refreshQuietly);
    client.on(CryptoEvent.KeysChanged, this.refreshQuietly);
  }

  dispose() {
    this.client?.off(CryptoEvent.VerificationRequestReceived, this.receiveRequest);
    this.client?.off(CryptoEvent.UserTrustStatusChanged, this.refreshQuietly);
    this.client?.off(CryptoEvent.KeysChanged, this.refreshQuietly);
    const pending = this.request;
    this.detachRequest();
    if (pending?.pending) void pending.cancel().catch(() => undefined);
    this.cancelAuth();
    this.clearSecrets();
    this.client = null;
    this.state = emptyIdentityState();
    this.changed(this.state);
  }

  private crypto() {
    const crypto = this.client?.getCrypto();
    if (!crypto) throw new Error("Verschlüsselung ist noch nicht bereit. Bitte auf die Synchronisierung warten.");
    return crypto;
  }
  private update(patch: Partial<MatrixIdentityState>) {
    this.state = { ...this.state, ...patch }; this.changed(this.state);
  }
  private refreshQuietly = () => { void this.refresh().catch((error) => this.update({ error: this.message(error) })); };
  private message(error: unknown) { return error instanceof Error ? error.message : "Die Identitätsprüfung ist fehlgeschlagen."; }

  async refresh() {
    const client = this.client;
    const crypto = this.crypto();
    const [status, device, storage] = await Promise.all([
      crypto.getCrossSigningStatus(),
      crypto.getDeviceVerificationStatus(client!.getUserId()!, client!.getDeviceId()!),
      crypto.getSecretStorageStatus(),
    ]);
    if (this.client !== client) return;
    this.update({ available: true, deviceId: client!.getDeviceId()!, verified: device?.isVerified() ?? false,
      hasIdentity: status.publicKeysOnDevice, hasRecovery: Boolean(storage.defaultKeyId) });
  }

  private async operation(action: () => Promise<void>) {
    if (this.state.busy) throw new Error("Ein anderer Vorgang läuft bereits.");
    this.update({ busy: true, error: null, notice: null });
    try { await action(); await this.refresh(); }
    catch (error) { this.update({ error: this.message(error) }); throw error; }
    finally { this.update({ busy: false }); }
  }

  async recover(keyText: string) {
    return this.operation(async () => {
      const client = this.client!;
      const key = decodeRecoveryKey(keyText.trim());
      try {
        const id = await client.secretStorage.getDefaultKeyId();
        const entry = id ? await client.secretStorage.getKey(id) : null;
        if (!id || !entry) throw new Error("Es ist kein Wiederherstellungsschlüssel eingerichtet.");
        if (entry[1].algorithm !== "m.secret_storage.v1.aes-hmac-sha2" ||
          !await client.secretStorage.checkKey(key, entry[1] as SecretStorageKeyDescriptionAesV1)) {
          throw new Error("Dieser Wiederherstellungsschlüssel gehört nicht zu deiner aktuellen Identität.");
        }
        this.keys.set(id, key);
        const crypto = this.crypto();
        const secrets = await Promise.all(["m.cross_signing.master", "m.cross_signing.self_signing", "m.cross_signing.user_signing"].map((name) => client.secretStorage.get(name)));
        if (!secrets.every(Boolean)) throw new Error("Die gespeicherten Identitätsschlüssel fehlen. Bitte ein bestätigtes Gerät verwenden oder die Identität ausdrücklich neu einrichten.");
        await crypto.bootstrapCrossSigning({});
        if (await crypto.getKeyBackupInfo()) {
          await crypto.loadSessionBackupPrivateKeyFromSecretStorage();
          const result = await crypto.restoreKeyBackup();
          this.update({ notice: `Identität wiederhergestellt. ${result.imported} Nachrichtenschlüssel geladen.` });
        } else this.update({ notice: "Identität wiederhergestellt. Auf dem Server ist kein Nachrichten-Backup vorhanden." });
      } finally { this.keys.clear(); key.fill(0); }
    });
  }

  async prepareReset() {
    if (this.state.busy || this.request?.pending) throw new Error("Bitte den laufenden Vorgang zuerst abschließen oder abbrechen.");
    this.clearSecrets();
    this.recovery = await this.crypto().createRecoveryKeyFromPassphrase();
    if (!this.recovery.encodedPrivateKey) throw new Error("Es konnte kein Wiederherstellungsschlüssel erzeugt werden.");
    this.update({ newRecoveryKey: this.recovery.encodedPrivateKey, error: null, notice: null });
  }

  async reset(confirmed: boolean) {
    if (!confirmed || !this.recovery) throw new Error("Bitte zuerst den neuen Schlüssel sichern und das Ersetzen bestätigen.");
    const recovery = this.recovery;
    return this.operation(async () => {
      const crypto = this.crypto();
      try {
        await crypto.resetEncryption(this.authenticate);
        await crypto.bootstrapSecretStorage({
          setupNewSecretStorage: true, setupNewKeyBackup: false,
          createSecretStorageKey: async () => recovery,
        });
        this.update({ resetComplete: true, notice: "Neue Identität eingerichtet. Andere Geräte und Kontakte müssen sie erneut bestätigen." });
      } finally { this.keys.clear(); }
    });
  }

  // Passwords and recovery keys remain in memory and never enter persistence.
  private authenticate: UIAuthCallback<void> = async (makeRequest) => {
    let auth: AuthDict = {};
    while (true) {
      try { await makeRequest(auth); this.update({ auth: null }); return; }
      catch (error) {
        const failure = error as { httpStatus?: number; data?: { session?: string; flows?: { stages: string[] }[]; completed?: string[]; error?: string } };
        const data = failure.data;
        if (failure.httpStatus !== 401 || !data?.session || !data.flows?.length) throw error;
        const flow = data.flows.find((item) => item.stages.every((stage) => stage === "m.login.password" || data.completed?.includes(stage))) ?? data.flows[0];
        const stage = flow.stages.find((item) => !data.completed?.includes(item)) ?? "m.login.dummy";
        if (stage === "m.login.dummy") {
          if ("type" in auth && auth.type === stage) throw error;
          auth = { session: data.session, type: stage }; continue;
        }
        const password = await new Promise<string | undefined>((resolve, reject) => {
          this.authInput = { resolve, reject };
          this.update({ auth: { session: data.session!, stage, error: data.error,
            url: `${this.client!.getHomeserverUrl().replace(/\/$/, "")}/_matrix/client/v3/auth/${encodeURIComponent(stage)}/fallback/web?session=${encodeURIComponent(data.session!)}` } });
        });
        this.authInput = null;
        auth = stage === "m.login.password" ? {
          session: data.session, type: stage, identifier: { type: "m.id.user", user: this.client!.getUserId()! }, password: password ?? "",
        } : { session: data.session };
      }
    }
  };
  submitAuth(password?: string) { this.authInput?.resolve(password); }
  cancelAuth() { this.authInput?.reject(new Error("Identitätseinrichtung abgebrochen. Falls bereits Änderungen erfolgt sind, bitte die Einrichtung erneut abschließen.")); this.authInput = null; this.update({ auth: null }); }
  clearSecrets() {
    this.keys.forEach((key) => key.fill(0)); this.keys.clear();
    this.recovery?.privateKey.fill(0); this.recovery = null;
    this.update({ newRecoveryKey: null, resetComplete: false });
  }

  async requestVerification() {
    if (this.request?.pending) throw new Error("Es läuft bereits eine Bestätigung.");
    await this.operation(async () => { this.bindRequest(await this.crypto().requestOwnUserVerification()); });
  }
  private receiveRequest = (request: VerificationRequest) => {
    // Never silently replace a comparison the user is already reviewing.
    if (this.request?.pending && this.request !== request) return;
    this.bindRequest(request);
  };
  private detachRequest() {
    this.request?.off(VerificationRequestEvent.Change, this.requestChanged);
    this.verifier?.off(VerifierEvent.ShowSas, this.showSas);
    this.verifier = null; this.request = null; this.sas = null;
  }
  private bindRequest(request: VerificationRequest) {
    this.detachRequest(); this.request = request;
    request.on(VerificationRequestEvent.Change, this.requestChanged);
    this.update({ error: null }); this.requestChanged();
  }
  private requestChanged = () => {
    const request = this.request;
    if (!request) return;
    const phase = request.phase === VerificationPhase.Done ? "done" : request.phase === VerificationPhase.Cancelled ? "cancelled"
      : request.phase === VerificationPhase.Ready ? "ready" : request.phase === VerificationPhase.Started ? "started" : "requested";
    const sas = phase === "started" ? this.sas?.sas : undefined;
    this.update({ verification: { userId: request.otherUserId, deviceId: request.otherDeviceId,
      incoming: !request.initiatedByMe, phase, emoji: sas?.emoji, decimal: sas?.decimal } });
    if (request.verifier && this.verifier !== request.verifier) this.bindVerifier(request.verifier);
    if (phase === "done") {
      this.sas = null;
      this.update({ notice: "Identität bestätigt." }); this.refreshQuietly();
      void this.crypto().checkKeyBackupAndEnable().catch(() => undefined);
    }
  };
  private bindVerifier(verifier: Verifier) {
    if (this.verifier === verifier) return;
    this.verifier?.off(VerifierEvent.ShowSas, this.showSas);
    this.verifier = verifier;
    verifier.on(VerifierEvent.ShowSas, this.showSas);
    const sas = verifier.getShowSasCallbacks(); if (sas) this.showSas(sas);
    void verifier.verify().then(() => this.requestChanged()).catch((error) => {
      if (this.verifier === verifier) { this.update({ error: this.message(error) }); this.requestChanged(); }
    });
  }
  private showSas = (sas: ShowSasCallbacks) => { this.sas = sas; this.requestChanged(); };
  async acceptVerification() { if (!this.request) throw new Error("Keine Bestätigungsanfrage vorhanden."); await this.request.accept(); }
  async startComparison() { if (!this.request) throw new Error("Keine Bestätigungsanfrage vorhanden."); this.bindVerifier(await this.request.startVerification("m.sas.v1")); }
  async confirmComparison(matches: boolean) {
    if (!this.sas) throw new Error("Es gibt noch keinen Vergleichscode.");
    const sas = this.sas; this.sas = null;
    if (matches) await sas.confirm(); else sas.mismatch();
    this.requestChanged();
  }
  async cancelVerification() { await this.request?.cancel(); this.requestChanged(); }
}
