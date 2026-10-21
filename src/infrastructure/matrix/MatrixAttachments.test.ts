import { readMediaMetadata } from "./MediaMetadata";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MatrixClient } from "matrix-js-sdk";
import { sendAttachment, loadAttachment } from "./MatrixAttachments";
import { encryptAttachment, decryptAttachment } from "./MatrixAttachmentCrypto";

vi.mock("./MediaMetadata", () => ({ readMediaMetadata: vi.fn(async () => ({})) }));
afterEach(() => { vi.unstubAllGlobals(); vi.mocked(readMediaMetadata).mockReset().mockResolvedValue({}); });
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
  it.each([["clip.webm", "video/webm", "m.video"], ["clip.mp4", "video/mp4", "m.video"], ["clip.mpg", "", "m.video"], ["song.mp3", "audio/mpeg", "m.audio"], ["song.wav", "", "m.audio"]])("sends %s as a native video/audio message", async (name, type, msgtype) => {
    const { sdk, client } = setup();
    await sendAttachment(client, "!room", new File(["media"], name, { type }));
    expect(sdk.sendEvent).toHaveBeenCalledWith("!room", "m.room.message", expect.objectContaining({ msgtype, body: name, info: expect.objectContaining({ mimetype: expect.stringMatching(/^(video|audio)\//) }) }));
  });
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

it("uploads an independently encrypted video poster and duration metadata in encrypted rooms", async () => {
  const { sdk, client } = setup(true);
  const poster = new Blob(["private preview"], { type: "image/jpeg" });
  vi.mocked(readMediaMetadata).mockResolvedValueOnce({ durationMs: 1200, width: 640, height: 360, poster });
  sdk.uploadContent.mockResolvedValueOnce({ content_uri: "mxc://example.org/video" }).mockResolvedValueOnce({ content_uri: "mxc://example.org/poster" });
  await sendAttachment(client, "!encrypted", new File(["private video"], "secret.mp4", { type: "video/mp4" }));
  const content = sdk.sendEvent.mock.calls[0][2];
  expect(content.info).toMatchObject({ duration: 1200, w: 640, h: 360, thumbnail_file: { url: "mxc://example.org/poster", v: "v2" } });
  expect(content.info.thumbnail_url).toBeUndefined();
  expect(content.info.thumbnail_file.key.k).not.toBe(content.file.key.k);
  const [upload, options] = sdk.uploadContent.mock.calls[1];
  expect(options).toMatchObject({ includeFilename: false, type: "application/octet-stream", name: "attachment" });
  expect(new TextDecoder().decode(await decryptAttachment(await upload.arrayBuffer(), content.info.thumbnail_file))).toBe("private preview");
});
it("still sends the original when thumbnail creation or upload fails", async () => {
  const { sdk, client } = setup();
  vi.mocked(readMediaMetadata).mockResolvedValueOnce({ poster: new Blob(["preview"], { type: "image/jpeg" }) });
  sdk.uploadContent.mockResolvedValueOnce({ content_uri: "mxc://example.org/video" }).mockRejectedValueOnce(new Error("Preview upload failed"));
  await sendAttachment(client, "!room", new File(["video"], "clip.mp4", { type: "video/mp4" }));
  expect(sdk.sendEvent).toHaveBeenCalledWith("!room", "m.room.message", expect.objectContaining({ url: "mxc://example.org/video" }));
});
