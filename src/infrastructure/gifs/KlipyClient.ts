import { gifUrl } from "../../domain/messaging/GifMessage";
import { ConventionalApiClient, type IHttpClient } from "../http/ConventionalApiClient";

export interface GifResult {
  id: string;
  title: string;
  url: string;
  previewUrl: string;
  width: number;
  height: number;
}
export interface GifPage { results: GifResult[]; next: string | null }
interface Media { url?: unknown; dims?: number[] }
interface Response {
  results?: { id?: string; title?: string; content_description?: string; media_formats?: { gif?: Media; tinygif?: Media } }[];
  next?: string;
}

/** KLIPY's documented Tenor-compatible v2 API, using a KLIPY API key. */
export class KlipyClient {
  constructor(private readonly key: string, private readonly http: IHttpClient = new ConventionalApiClient("https://api.klipy.com/v2")) {}

  async search(query: string, position?: string, signal?: AbortSignal): Promise<GifPage> {
    if (!this.key.trim()) throw new Error("Enter a KLIPY API key first.");
    try {
      const response = await this.http.get<Response>(query.trim() ? "/search" : "/featured", {
        signal,
        params: { key: this.key, client_key: "grungus_matrix", q: query.trim() || undefined,
          pos: position || undefined, limit: 24, media_filter: "gif,tinygif", contentfilter: "medium",
          locale: typeof navigator === "undefined" ? "de_DE" : navigator.language.replaceAll("-", "_") },
      });
      if (!Array.isArray(response.results)) throw new Error("invalid-response");
      const results = response.results.flatMap((item): GifResult[] => {
        const full = item.media_formats?.gif ?? item.media_formats?.tinygif;
        const preview = item.media_formats?.tinygif ?? full;
        const url = gifUrl(full?.url);
        const previewUrl = gifUrl(preview?.url);
        if (!item.id || !url || !previewUrl) return [];
        const [width = 240, height = 180] = preview?.dims ?? [];
        return [{ id: item.id, title: item.content_description || item.title || "GIF", url, previewUrl,
          width: Number.isFinite(width) && width > 0 ? width : 240,
          height: Number.isFinite(height) && height > 0 ? height : 180 }];
      });
      return { results, next: response.next && response.next !== "0" ? response.next : null };
    } catch (cause) {
      if (signal?.aborted) throw cause;
      const status = (cause as { response?: { status?: number } }).response?.status;
      if (status === 401 || status === 403) throw new Error("KLIPY rejected the API key. Check the key and its permissions.");
      if (status === 429) throw new Error("Too many GIF requests. Please try again shortly.");
      throw new Error("Unable to load GIFs. Check your connection and KLIPY API key.");
    }
  }

  async registerShare(id: string, query: string): Promise<void> {
    await this.http.get("/registershare", { params: { key: this.key, client_key: "grungus_matrix", id, q: query || undefined } });
  }
}

const STORAGE_KEY = "grungus.klipy-api-key";
export function hasDefaultKlipyKey(): boolean { return Boolean(import.meta.env.VITE_KLIPY_API_KEY?.trim()); }
export function readKlipyKey(): string {
  if (hasDefaultKlipyKey()) return import.meta.env.VITE_KLIPY_API_KEY!.trim();
  try { return localStorage.getItem(STORAGE_KEY)?.trim() || ""; }
  catch { return import.meta.env.VITE_KLIPY_API_KEY?.trim() || ""; }
}
export function saveKlipyKey(key: string): void {
  try { if (key.trim()) localStorage.setItem(STORAGE_KEY, key.trim()); else localStorage.removeItem(STORAGE_KEY); }
  catch { /* A key still works for this picker session when browser storage is unavailable. */ }
}
