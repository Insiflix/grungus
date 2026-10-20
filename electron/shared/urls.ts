/** Credentials may travel over HTTP only to an explicitly selected loopback server. */
export function secureHomeserverUrl(value: string): string {
  const url = new URL(value);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || (url.protocol !== "https:" && !(url.protocol === "http:" && loopback))) throw new Error("Homeservers must use HTTPS (HTTP is allowed only on localhost).");
  return url.origin + url.pathname.replace(/\/$/, "");
}

export function secureExternalUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("Only HTTPS URLs without embedded credentials may be opened.");
  return url.href;
}
