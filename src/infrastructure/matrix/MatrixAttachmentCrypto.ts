import type { EncryptedAttachment } from "../../domain/messaging/Attachments";

const base64 = (data: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(data))).replace(/=+$/, "");
const bytes = (value: string) => Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), char => char.charCodeAt(0));

/** Matrix encrypted attachments v2: AES-256-CTR, a random 64-bit IV, and SHA-256 ciphertext hash. */
export async function encryptAttachment(data: ArrayBuffer) {
  const key = await crypto.subtle.generateKey({ name: "AES-CTR", length: 256 }, true, ["encrypt", "decrypt"]);
  const counter = new Uint8Array(16);
  crypto.getRandomValues(counter.subarray(0, 8));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-CTR", counter, length: 64 }, key, data);
  const jwk = await crypto.subtle.exportKey("jwk", key);
  const metadata: Omit<EncryptedAttachment, "url"> = {
    v: "v2", key: { kty: "oct", alg: "A256CTR", ext: true, key_ops: ["encrypt", "decrypt"], k: jwk.k! },
    iv: base64(counter.buffer), hashes: { sha256: base64(await crypto.subtle.digest("SHA-256", ciphertext)) },
  };
  return { ciphertext, metadata };
}
export async function decryptAttachment(data: ArrayBuffer, file: EncryptedAttachment): Promise<ArrayBuffer> {
  if (file.v !== "v2" || file.key?.alg !== "A256CTR" || file.key.kty !== "oct" || !file.hashes?.sha256) throw new Error("Unsupported encrypted attachment.");
  const expected = bytes(file.hashes.sha256);
  const actual = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  if (expected.length !== actual.length || actual.some((byte, index) => byte !== expected[index])) throw new Error("Attachment integrity check failed.");
  const counter = bytes(file.iv);
  if (counter.length !== 16) throw new Error("Invalid attachment encryption counter.");
  const key = await crypto.subtle.importKey("jwk", file.key, { name: "AES-CTR" }, false, ["decrypt"]);
  return crypto.subtle.decrypt({ name: "AES-CTR", counter, length: 64 }, key, data);
}
