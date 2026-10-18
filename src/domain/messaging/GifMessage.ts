/** GIF messages remain ordinary Matrix text messages for other clients. */
export function gifUrl(value: unknown): string | null {
  if (typeof value !== "string" || /\s/.test(value)) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.href;
  } catch { return null; }
}

export function parseGifMessage(body: string): string | null {
  const match = /^\/gif\s+(\S+)\s*$/i.exec(body.trim());
  return match ? gifUrl(match[1]) : null;
}

export function createGifMessage(url: string): string {
  const safeUrl = gifUrl(url);
  if (!safeUrl) throw new Error("Bitte eine gültige HTTPS-URL für das GIF verwenden.");
  return `/gif ${safeUrl}`;
}
