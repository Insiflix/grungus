import { describe, expect, it, vi } from "vitest";
import type { IHttpClient } from "../http/ConventionalApiClient";
import { KlipyClient, hasDefaultKlipyKey, readKlipyKey } from "./KlipyClient";

const result = { id: "123", content_description: "A happy frog", media_formats: {
  gif: { url: "https://static.klipy.com/full.gif", dims: [480, 360] },
  tinygif: { url: "https://static.klipy.com/preview.gif", dims: [160, 120] },
} };
function setup() {
  const get = vi.fn().mockResolvedValue({ results: [result], next: "page-2" });
  const client = new KlipyClient("test-klipy-key", { get } as IHttpClient);
  return { get, client };
}
describe("KLIPY GIF integration", () => {
  it("always prefers the configured project key over an older local key", () => {
    vi.stubEnv("VITE_KLIPY_API_KEY", "configured-test-key");
    vi.stubGlobal("localStorage", { getItem: () => "outdated-local-key" });
    try {
      expect(hasDefaultKlipyKey()).toBe(true);
      expect(readKlipyKey()).toBe("configured-test-key");
    } finally { vi.unstubAllGlobals(); vi.unstubAllEnvs(); }
  });
  it("uses trending GIFs for an empty query and maps preview and send URLs separately", async () => {
    const { client, get } = setup();
    const page = await client.search("");
    expect(get).toHaveBeenCalledWith("/featured", expect.objectContaining({ params: expect.objectContaining({ key: "test-klipy-key", client_key: "grungus_matrix", media_filter: "gif,tinygif" }) }));
    expect(page).toEqual({ results: [{ id: "123", title: "A happy frog", url: "https://static.klipy.com/full.gif", previewUrl: "https://static.klipy.com/preview.gif", width: 160, height: 120 }], next: "page-2" });
  });
  it("passes search terms, pagination and cancellation to the HTTP client", async () => {
    const { client, get } = setup();
    const signal = new AbortController().signal;
    await client.search(" frog & toad ", "page-2", signal);
    expect(get).toHaveBeenCalledWith("/search", expect.objectContaining({ signal, params: expect.objectContaining({ q: "frog & toad", pos: "page-2" }) }));
  });
  it("ignores missing and unsafe image URLs", async () => {
    const { client, get } = setup();
    get.mockResolvedValueOnce({ results: [{ id: "broken" }, { id: "unsafe", media_formats: { gif: { url: "javascript:alert(1)" } } }, result], next: "0" });
    const page = await client.search("frog");
    expect(page.results).toHaveLength(1);
    expect(page.next).toBeNull();
  });
  it("reports missing keys, rejected keys, rate limits, and network failures without exposing keys", async () => {
    const { client, get } = setup();
    await expect(new KlipyClient("", { get } as IHttpClient).search("frog")).rejects.toThrow("API key");
    expect(get).not.toHaveBeenCalled();
    get.mockRejectedValueOnce({ response: { status: 403 } });
    await expect(client.search("frog")).rejects.toThrow("rejected");
    get.mockRejectedValueOnce({ response: { status: 429 } });
    await expect(client.search("frog")).rejects.toThrow("Too many");
    get.mockRejectedValueOnce(new Error("key=test-klipy-key"));
    await expect(client.search("frog")).rejects.toThrow("connection");
  });
  it("registers a successful share with KLIPY", async () => {
    const { client, get } = setup();
    await client.registerShare("123", "frog");
    expect(get).toHaveBeenCalledWith("/registershare", { params: { key: "test-klipy-key", client_key: "grungus_matrix", id: "123", q: "frog" } });
  });
});
