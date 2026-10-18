import type { MatrixClient } from "matrix-js-sdk";

/** Authenticated Matrix media becomes a blob URL; access tokens never enter image URLs. */
export class MatrixAvatarLoader {
  private cache = new Map<string, Promise<string>>();
  private urls = new Set<string>();
  private controllers = new Set<AbortController>();
  private generation = 0;
  constructor(private readonly client: MatrixClient, private readonly request: typeof fetch = fetch) {}

  async load(url: string): Promise<string> {
    const target = new URL(url);
    const home = new URL(this.client.getHomeserverUrl());
    const prefix = `${home.pathname.replace(/\/$/, "")}/_matrix/client/v1/media/`;
    const isMedia = target.origin === home.origin && target.pathname.startsWith(prefix) && /\/(thumbnail|download)\//.test(target.pathname);
    // External avatars are displayed without receiving Matrix credentials.
    if (!isMedia) {
      if (!["https:", "http:", "blob:"].includes(target.protocol)) return Promise.reject(new Error("Invalid avatar URL"));
      return Promise.resolve(url);
    }
    const cached = this.cache.get(url); if (cached) return cached;
    const pending = this.fetchImage(target).catch((error) => { this.cache.delete(url); throw error; });
    this.cache.set(url, pending); return pending;
  }

  private async fetchImage(target: URL): Promise<string> {
    const generation = this.generation;
    const controller = new AbortController(); this.controllers.add(controller);
    const token = this.client.getAccessToken();
    if (!token) { this.controllers.delete(controller); throw new Error("No Matrix session"); }
    const options: RequestInit = { headers: { Authorization: `Bearer ${token}` }, credentials: "omit", referrerPolicy: "no-referrer", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]) };
    try {
      let response = await this.request(target.href, options);
      if ([400, 404, 405, 501].includes(response.status) && target.pathname.includes("/thumbnail/")) {
        const original = new URL(target); original.pathname = original.pathname.replace("/thumbnail/", "/download/"); original.search = "";
        response = await this.request(original.href, options);
      }
      if (!response.ok) throw new Error("Avatar could not be loaded");
      const image = await response.blob();
      if (!image.type.startsWith("image/") || generation !== this.generation) throw new Error("Invalid or expired avatar");
      const blobUrl = URL.createObjectURL(image); this.urls.add(blobUrl); return blobUrl;
    } finally { this.controllers.delete(controller); }
  }
  clear() {
    ++this.generation;
    this.controllers.forEach((controller) => controller.abort()); this.controllers.clear();
    this.urls.forEach((url) => URL.revokeObjectURL(url)); this.urls.clear(); this.cache.clear();
  }
}
