import { useSyncExternalStore } from "react";
import type { GifResult } from "../../../infrastructure/gifs/KlipyClient";
import { gifUrl } from "../../../domain/messaging/GifMessage";

const key = "grungus.gif-favorites";
const listeners = new Set<() => void>();
let snapshot: GifResult[] = [];
let stored: string | null | undefined;
const empty: GifResult[] = [];

function read(): GifResult[] {
  try {
    const raw = localStorage.getItem(key);
    if (raw === stored) return snapshot;
    stored = raw;
    snapshot = [];
    const values: unknown = raw ? JSON.parse(raw) : [];
    snapshot = Array.isArray(values) ? values.filter((value): value is GifResult => Boolean(value &&
      typeof value.id === "string" && typeof value.title === "string" && gifUrl(value.url) && gifUrl(value.previewUrl) &&
      Number.isFinite(value.width) && value.width > 0 && Number.isFinite(value.height) && value.height > 0)) : [];
  } catch { /* Keep this session's favourites when storage is unavailable. */ }
  return snapshot;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => { if (event.key === key || event.key === null) listener(); };
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(listener); window.removeEventListener("storage", onStorage); };
}

export function useGifFavorites() {
  const favorites = useSyncExternalStore(subscribe, read, () => empty);
  const toggle = (gif: GifResult) => {
    if (!gifUrl(gif.url) || !gifUrl(gif.previewUrl)) return;
    const current = read();
    snapshot = current.some(item => item.url === gif.url) ? current.filter(item => item.url !== gif.url) : [gif, ...current];
    try { const raw = JSON.stringify(snapshot); localStorage.setItem(key, raw); stored = raw; } catch { /* Retain session state. */ }
    listeners.forEach(listener => listener());
  };
  return { favorites, toggle, isFavorite: (url: string) => favorites.some(gif => gif.url === url) };
}
