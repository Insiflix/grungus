import { afterEach, describe, expect, it, vi } from "vitest";
import type { MatrixClient } from "matrix-js-sdk";
import { sendAttachment, loadAttachment } from "./MatrixAttachments";
import { encryptAttachment, decryptAttachment } from "./MatrixAttachmentCrypto";

afterEach(() => vi.unstubAllGlobals());
const file = () => new File(["private content"], "notes.txt", { type: "text/plain" });
function setup(encrypted = false) {
  const sdk = {
    isRoomEncrypted: () => encrypted,
    getMediaConfig: vi.fn().mockResolvedValue({ "m.upload.size": 50 * 1024 * 1024 }),
    uploadContent: vi.fn().mockResolvedValue({ content_uri: "mxc://example.org/file" }),
    sendEvent: vi.fn().mockResolvedValue({ event_id: "$file" }),
    getHomeserverUrl: () => "https://matrix.example.org",
    getAccessToken: () => "test-token",
  };
  return { sdk, client: sdk as unknown as MatrixClient };
}
describe("Matrix file attachments", () => {
  it("uploads ordinary files and sends a native Matrix attachment event with reply metadata", async () => {
    const { sdk, client } = setup();
    const progress = vi.fn();
    await sendAttachment(client, "!room", file(), progress, { replyToEventId: "$reply" });
    expect(sdk.uploadContent.mock.calls[0][0]).toBeInstanceOf(File);
    expect(sdk.sendEvent).toHaveBeenCalledWith("!room", "m.room.message", expect.objectContaining({
      msgtype: "m.file", body: "notes.txt", url: "mxc://example.org/file", info: { mimetype: "text/plain", size: 15 }, "m.relates_to": { "m.in_reply_to": { event_id: "$reply" } },
    }));
    expect(progress).toHaveBeenLastCalledWith(100);
  });
  it("encrypts media before uploading in encrypted rooms, hiding filenames and preserving content integrity", async () => {
    const { sdk, client } = setup(true);
    await sendAttachment(client, "!encrypted", new File(["private content"], "secret.png", { type: "image/png" }));
    const [upload, options] = sdk.uploadContent.mock.calls[0];
    expect(options).toMatchObject({ includeFilename: false, type: "application/octet-stream" });
    expect(await upload.text()).not.toBe("private content");
    const content = sdk.sendEvent.mock.calls[0][2];
    expect(content.url).toBeUndefined();
    expect(content.msgtype).toBe("m.image");
    expect(content.file).toMatchObject({ v: "v2", url: "mxc://example.org/file", key: { alg: "A256CTR" } });
    expect(new TextDecoder().decode(await decryptAttachment(await upload.arrayBuffer(), content.file))).toBe("private content");
  });
  it("rejects tampered ciphertext and uses independent keys for each upload", async () => {
    const data = new TextEncoder().encode("a private file").buffer;
    const first = await encryptAttachment(data);
    const second = await encryptAttachment(data);
    expect(first.metadata.key.k).not.toBe(second.metadata.key.k);
    const corrupt = new Uint8Array(first.ciphertext.slice(0)); corrupt[0] ^= 1;
    await expect(decryptAttachment(corrupt.buffer, { ...first.metadata, url: "mxc://example/file" })).rejects.toThrow("integrity");
  });
  it("downloads through authenticated media without credentials in URLs and decrypts the blob", async () => {
    const { client } = setup();
    const encrypted = await encryptAttachment(new TextEncoder().encode("private content").buffer);
    const request = vi.fn().mockResolvedValue(new Response(encrypted.ciphertext));
    vi.stubGlobal("fetch", request);
    const result = await loadAttachment(client, { name: "notes.txt", mimeType: "text/plain", url: "mxc://example.org/file", encrypted: { ...encrypted.metadata, url: "mxc://example.org/file" } });
    expect(await result.text()).toBe("private content");
    expect(request).toHaveBeenCalledWith("https://matrix.example.org/_matrix/client/v1/media/download/example.org/file?allow_redirect=true", expect.objectContaining({ headers: { Authorization: "Bearer test-token" }, redirect: "follow" }));
    await expect(loadAttachment(client, { name: "bad", mimeType: "text/html", url: "https://other.example/file" })).rejects.toThrow("Invalid Matrix");
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("does not send a timeline event when the upload fails", async () => {
    const { sdk, client } = setup();
    sdk.uploadContent.mockRejectedValue(new Error("Too large"));
    await expect(sendAttachment(client, "!room", file())).rejects.toThrow("Too large");
    expect(sdk.sendEvent).not.toHaveBeenCalled();
  });
});
