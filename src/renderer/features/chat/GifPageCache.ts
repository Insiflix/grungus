import type { GifPage } from "../../../infrastructure/gifs/KlipyClient";

/** First pages survive closing the picker; bound memory and refresh trends after five minutes. */
export class GifPageCache {
  private readonly pages = new Map<string, { page: GifPage; expires: number }>();
  private id(apiKey: string, query: string) { return JSON.stringify([apiKey, navigator.language, query.trim()]); }
  get(apiKey: string, query: string): GifPage | undefined {
    const id = this.id(apiKey, query);
    const entry = this.pages.get(id);
    if (!entry) return;
    if (entry.expires <= Date.now()) { this.pages.delete(id); return; }
    return entry.page;
  }
  set(apiKey: string, query: string, page: GifPage) {
    const id = this.id(apiKey, query);
    this.pages.delete(id);
    this.pages.set(id, { page, expires: Date.now() + 5 * 60_000 });
    if (this.pages.size > 20) this.pages.delete(this.pages.keys().next().value!);
  }
}

export const gifPageCache = new GifPageCache();
