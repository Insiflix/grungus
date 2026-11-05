import { UserId, type KeysQueryRequest, type OlmMachine } from "@matrix-org/matrix-sdk-crypto-wasm";
import type { MatrixClient } from "matrix-js-sdk";

// matrix-js-sdk 42.3's public device-list download does not import untracked
// devices into the Olm machine. Keep this compatibility bridge isolated: the
// request processor both downloads the keys and imports/validates the response.
interface DeviceKeyRefreshBackend {
  olmMachine: Pick<OlmMachine, "queryKeysForUsers">;
  outgoingRequestProcessor: { makeOutgoingRequest(request: KeysQueryRequest): Promise<unknown> };
}

export async function sendEncryptedCallEvent(client: MatrixClient, type: string, userId: string, deviceId: string, content: object) {
  const crypto = client.getCrypto();
  if (!crypto) throw new Error("Call encryption is unavailable");
  const devices = [{ userId, deviceId }];
  const includesRecipient = (batch: Awaited<ReturnType<typeof crypto.encryptToDeviceMessages>>) =>
    batch.batch.some(message => message.userId === userId && message.deviceId === deviceId);

  let batch = await crypto.encryptToDeviceMessages(type, devices, content);
  if (!includesRecipient(batch)) {
    const backend = crypto as unknown as Partial<DeviceKeyRefreshBackend>;
    if (!backend.olmMachine?.queryKeysForUsers || !backend.outgoingRequestProcessor?.makeOutgoingRequest) {
      throw new Error(`Cannot refresh call encryption device ${userId}:${deviceId}: unsupported crypto backend`);
    }
    const request = backend.olmMachine.queryKeysForUsers([new UserId(userId)]);
    await backend.outgoingRequestProcessor.makeOutgoingRequest(request);
    batch = await crypto.encryptToDeviceMessages(type, devices, content);
    if (!includesRecipient(batch)) throw new Error(`Call encryption device is unknown after key refresh: ${userId}:${deviceId}`);
  }
  await client.queueToDevice(batch);
}
