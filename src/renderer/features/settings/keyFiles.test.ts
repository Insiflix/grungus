import { describe, expect, it } from "vitest";
import { encryptRoomKeys, decryptRoomKeys } from "./keyFiles";

describe("Matrix encrypted room-key files", () => {
  it("round-trips standard Matrix armored exports and rejects a wrong passphrase", async () => {
    const { initAsync, OlmMachine, UserId, DeviceId, RoomId, EncryptionSettings } = await import("@matrix-org/matrix-sdk-crypto-wasm");
    await initAsync();
    const machine = await OlmMachine.initialize(new UserId("@test:example.org"), new DeviceId("TEST"));
    await machine.shareRoomKey(new RoomId("!room:example.org"), [], new EncryptionSettings());
    const keys = await machine.exportRoomKeys(() => true);
    expect(JSON.parse(keys).length).toBeGreaterThan(0);
    const encrypted = await encryptRoomKeys(keys, "correct horse battery staple");
    expect(encrypted).toContain("-----BEGIN MEGOLM SESSION DATA-----");
    expect(encrypted).not.toContain(JSON.parse(keys)[0].session_key);
    expect(JSON.parse(await decryptRoomKeys(encrypted, "correct horse battery staple"))).toEqual(JSON.parse(keys));
    await expect(decryptRoomKeys(encrypted, "wrong passphrase")).rejects.toThrow("Unable to decrypt");
    machine.close();
  });
});
