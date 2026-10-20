import { afterEach, describe, expect, it, vi } from "vitest";
import type { MatrixClient } from "matrix-js-sdk";
import { getUploadLimit } from "./MatrixUploadLimit";
import { sendAttachment } from "./MatrixAttachments";

afterEach(() => vi.useRealTimers());
function setup(size: unknown = 10) {
  const sdk = { getMediaConfig: vi.fn().mockResolvedValue({ "m.upload.size": size }), isRoomEncrypted: () => true, uploadContent: vi.fn().mockResolvedValue({ content_uri: "mxc://example/file" }), sendEvent: vi.fn().mockResolvedValue({ event_id: "$file" }) };
  return { sdk, client: sdk as unknown as MatrixClient };
}
describe("server upload limits", () => {
  it("reads authenticated media config once, shares in-flight requests, and refreshes after five minutes", async () => {
    vi.useFakeTimers();
    const { sdk, client } = setup();
    expect(await Promise.all([getUploadLimit(client), getUploadLimit(client)])).toEqual([10, 10]);
    expect(sdk.getMediaConfig).toHaveBeenCalledExactlyOnceWith(true);
    vi.advanceTimersByTime(5 * 60_000);
    sdk.getMediaConfig.mockResolvedValue({ "m.upload.size": 20 });
    expect(await getUploadLimit(client)).toBe(20);
  });
  it("falls back to legacy config for older servers and retries failed lookups", async () => {
    const { sdk, client } = setup();
    sdk.getMediaConfig.mockRejectedValueOnce({ httpStatus: 404 });
    expect(await getUploadLimit(client)).toBe(10);
    expect(sdk.getMediaConfig).toHaveBeenLastCalledWith(false);
    const other = setup();
    other.sdk.getMediaConfig.mockRejectedValueOnce(new Error("Offline"));
    await expect(getUploadLimit(other.client)).rejects.toThrow("Offline");
    expect(await getUploadLimit(other.client)).toBe(10);
  });
  it.each([undefined, null, -1, "1000", Infinity])("treats an absent or invalid advertised limit (%s) as unknown", async size => {
    const { client } = setup(null);
    (client.getMediaConfig as ReturnType<typeof vi.fn>).mockResolvedValue({ "m.upload.size": size });
    expect(await getUploadLimit(client)).toBeNull();
  });
  it("blocks oversized files before reading, encrypting, or uploading them", async () => {
    const { sdk, client } = setup(10);
    const file = new File(["12345678901"], "large.txt");
    const read = vi.spyOn(file, "arrayBuffer");
    await expect(sendAttachment(client, "!room", file)).rejects.toThrow("This server allows up to 10 B per file");
    expect(read).not.toHaveBeenCalled();
    expect(sdk.uploadContent).not.toHaveBeenCalled(); expect(sdk.sendEvent).not.toHaveBeenCalled();
    await sendAttachment(client, "!room", new File(["1234567890"], "exact.txt"));
    expect(sdk.uploadContent).toHaveBeenCalledOnce();
  });
});
