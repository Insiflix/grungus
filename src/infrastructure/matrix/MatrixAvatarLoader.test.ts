import { afterEach, describe, expect, it, vi } from "vitest";
import type { MatrixClient } from "matrix-js-sdk";
import { MatrixAvatarLoader } from "./MatrixAvatarLoader";

const url = "https://matrix.example.org/_matrix/client/v1/media/thumbnail/example.org/photo?width=96&height=96";
function setup() {
  const request = vi.fn<typeof fetch>().mockImplementation(async () => new Response(new Blob(["test-image"], { type: "image/png" })));
  const client = { getHomeserverUrl: () => "https://matrix.example.org", getAccessToken: () => "test-matrix-token" } as MatrixClient;
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test-avatar");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  return { loader: new MatrixAvatarLoader(client, request), request, client };
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe("authenticated Matrix avatars", () => {
  it("binds the default native fetch to the browser global instead of the loader", async () => {
    const { client, request } = setup();
    const nativeFetch = vi.fn(function (this: unknown, ...args: Parameters<typeof fetch>) {
      if (this !== globalThis) throw new TypeError("Failed to execute 'fetch' on 'Window': Illegal invocation");
      return request(...args);
    });
    vi.stubGlobal("fetch", nativeFetch);
    const loader = new MatrixAvatarLoader(client);
    expect(await loader.load(url)).toBe("blob:test-avatar");
    expect(nativeFetch).toHaveBeenCalledExactlyOnceWith(url, expect.objectContaining({
      headers: { Authorization: "Bearer test-matrix-token" },
    }));
    loader.clear();
  });
  it("uses a bearer header, shares concurrent requests, and returns a token-free blob URL", async () => {
    const { loader, request } = setup();
    expect(await Promise.all([loader.load(url), loader.load(url)])).toEqual(["blob:test-avatar", "blob:test-avatar"]);
    expect(request).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledWith(url, expect.objectContaining({ headers: { Authorization: "Bearer test-matrix-token" }, credentials: "omit" }));
    loader.clear(); expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test-avatar");
  });
  it("never sends Matrix credentials to external avatars or unrelated server paths", async () => {
    const { loader, request } = setup();
    expect(await loader.load("https://avatars.example.org/photo.png")).toBe("https://avatars.example.org/photo.png");
    expect(await loader.load("https://matrix.example.org/unrelated.png")).toBe("https://matrix.example.org/unrelated.png");
    expect(request).not.toHaveBeenCalled();
  });
  it("falls back to an authenticated original when thumbnails are unsupported", async () => {
    const { loader, request } = setup();
    request.mockResolvedValueOnce(new Response("Not found", { status: 404 }));
    await loader.load(url);
    expect(request).toHaveBeenLastCalledWith("https://matrix.example.org/_matrix/client/v1/media/download/example.org/photo", expect.objectContaining({ headers: { Authorization: "Bearer test-matrix-token" } }));
  });
  it("rejects invalid images and lets a later mount retry a failed fetch", async () => {
    const { loader, request } = setup();
    request.mockResolvedValueOnce(new Response("not an image", { headers: { "Content-Type": "text/html" } }));
    await expect(loader.load(url)).rejects.toThrow("Invalid");
    expect(await loader.load(url)).toBe("blob:test-avatar");
    expect(request).toHaveBeenCalledTimes(2);
    await expect(loader.load("javascript:alert(1)")).rejects.toThrow("Invalid");
  });
  it("does not create or retain object URLs when a session ends during a request", async () => {
    const { loader, request } = setup();
    let resolve!: (response: Response) => void;
    request.mockImplementationOnce(() => new Promise((complete) => { resolve = complete; }));
    const loading = loader.load(url);
    loader.clear(); resolve(new Response(new Blob(["image"], { type: "image/png" })));
    await expect(loading).rejects.toThrow("expired");
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
});
