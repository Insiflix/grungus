import { beforeAll, describe, expect, it, vi } from "vitest";
import { initAsync, UserId, DeviceId, OlmMachine, KeysUploadRequest } from "@matrix-org/matrix-sdk-crypto-wasm";
import type { MatrixClient } from "matrix-js-sdk";
import { OutgoingRequestProcessor } from "matrix-js-sdk/lib/rust-crypto/OutgoingRequestProcessor";
import { logger } from "matrix-js-sdk/lib/logger";
import { sendEncryptedCallEvent } from "./MatrixCallEncryption";
import { MatrixCallDriver } from "./MatrixCallDriver";

const userId = "@hanno:test";
const deviceId = "NEW_DEVICE";
const type = "io.element.call.encryption_keys";
const content = { keys: [{ index: 1, key: "test-key" }] };
const encrypted = { eventType: "m.room.encrypted", batch: [{ userId, deviceId, payload: { ciphertext: "encrypted" } }] };
const empty = { eventType: "m.room.encrypted", batch: [] };

beforeAll(async () => { await initAsync(); });

function fixture() {
  const encryptToDeviceMessages = vi.fn().mockResolvedValue(encrypted);
  const queryKeysForUsers = vi.fn((_users: UserId[]) => ({ id: "query" }));
  const makeOutgoingRequest = vi.fn().mockResolvedValue(undefined);
  const backend = { encryptToDeviceMessages, olmMachine: { queryKeysForUsers }, outgoingRequestProcessor: { makeOutgoingRequest } };
  const queueToDevice = vi.fn().mockResolvedValue(undefined);
  const client = { getCrypto: () => backend, queueToDevice, getRoom: () => ({ getMyMembership: () => "join", getMember: () => ({ membership: "join" }) }) } as unknown as MatrixClient;
  return { client, backend, encryptToDeviceMessages, queryKeysForUsers, makeOutgoingRequest, queueToDevice };
}

describe("encrypted call key delivery", () => {
  it("queues the encrypted payload without a key query for known devices", async () => {
    const f = fixture();
    await new MatrixCallDriver(f.client, "!call:test").sendToDevice(type, true, { [userId]: { [deviceId]: content } });
    expect(f.encryptToDeviceMessages).toHaveBeenCalledWith(type, [{ userId, deviceId }], content);
    expect(f.queueToDevice).toHaveBeenCalledWith(encrypted);
    expect(f.queryKeysForUsers).not.toHaveBeenCalled();
  });

  it("waits for device keys to be imported before retrying a skipped recipient", async () => {
    const f = fixture();
    f.encryptToDeviceMessages.mockResolvedValueOnce(empty);
    let finish!: () => void;
    f.makeOutgoingRequest.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
    const sending = sendEncryptedCallEvent(f.client, type, userId, deviceId, content);
    await vi.waitFor(() => expect(f.makeOutgoingRequest).toHaveBeenCalledOnce());
    expect(f.queryKeysForUsers.mock.calls[0][0][0].toString()).toBe(userId);
    expect(f.encryptToDeviceMessages).toHaveBeenCalledTimes(1);
    expect(f.queueToDevice).not.toHaveBeenCalled();
    finish();
    await sending;
    expect(f.encryptToDeviceMessages).toHaveBeenCalledTimes(2);
    expect(f.queueToDevice).toHaveBeenCalledWith(encrypted);
  });

  it("rejects a still-missing device instead of reporting an empty send as successful", async () => {
    const f = fixture();
    f.encryptToDeviceMessages.mockResolvedValue(empty);
    await expect(sendEncryptedCallEvent(f.client, type, userId, deviceId, content)).rejects.toThrow("unknown after key refresh");
    expect(f.encryptToDeviceMessages).toHaveBeenCalledTimes(2);
    expect(f.queueToDevice).not.toHaveBeenCalled();
  });

  it("checks the exact target even if the batch contains a different device", async () => {
    const f = fixture();
    f.encryptToDeviceMessages.mockResolvedValue({ ...encrypted, batch: [{ ...encrypted.batch[0], deviceId: "OLD_DEVICE" }] });
    await expect(sendEncryptedCallEvent(f.client, type, userId, deviceId, content)).rejects.toThrow("unknown after key refresh");
    expect(f.queueToDevice).not.toHaveBeenCalled();
  });

  it("propagates refresh failures without queueing a key or retrying forever", async () => {
    const f = fixture();
    f.encryptToDeviceMessages.mockResolvedValue(empty);
    f.makeOutgoingRequest.mockRejectedValue(new Error("keys query failed"));
    await expect(sendEncryptedCallEvent(f.client, type, userId, deviceId, content)).rejects.toThrow("keys query failed");
    expect(f.encryptToDeviceMessages).toHaveBeenCalledTimes(1);
    expect(f.queueToDevice).not.toHaveBeenCalled();
  });

  it("fails explicitly if an SDK upgrade removes the device refresh bridge", async () => {
    const f = fixture();
    f.encryptToDeviceMessages.mockResolvedValue(empty);
    Object.assign(f.backend, { olmMachine: undefined });
    await expect(sendEncryptedCallEvent(f.client, type, userId, deviceId, content)).rejects.toThrow("unsupported crypto backend");
    expect(f.queueToDevice).not.toHaveBeenCalled();
  });

  it("imports a newly logged-in device into the real Olm store, including for an untracked user", async () => {
    const sender = await OlmMachine.initialize(new UserId("@julian:test"), new DeviceId("SENDER"));
    const recipient = await OlmMachine.initialize(new UserId(userId), new DeviceId(deviceId));
    try {
      const upload = (await recipient.outgoingRequests()).find(request => request instanceof KeysUploadRequest)!;
      const deviceKeys = JSON.parse(upload.body).device_keys;
      const f = fixture();
      Object.assign(f.backend, { olmMachine: sender });
      f.encryptToDeviceMessages.mockImplementation(async () => {
        const device = await sender.getDevice(new UserId(userId), new DeviceId(deviceId));
        if (!device) return empty;
        device.free();
        return encrypted;
      });
      const authedRequest = vi.fn().mockResolvedValue(JSON.stringify({ device_keys: { [userId]: { [deviceId]: deviceKeys } }, failures: {} }));
      const http = { authedRequest } as unknown as ConstructorParameters<typeof OutgoingRequestProcessor>[2];
      Object.assign(f.backend, { outgoingRequestProcessor: new OutgoingRequestProcessor(logger, sender, http) });
      await sendEncryptedCallEvent(f.client, type, userId, deviceId, content);
      expect(authedRequest).toHaveBeenCalledWith("POST", "/_matrix/client/v3/keys/query", {}, expect.any(String), expect.any(Object));
      expect(f.encryptToDeviceMessages).toHaveBeenCalledTimes(2);
      expect(f.queueToDevice).toHaveBeenCalledWith(encrypted);
    } finally {
      sender.close();
      recipient.close();
    }
  });
});
