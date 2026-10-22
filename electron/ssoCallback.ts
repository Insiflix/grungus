import { createServer, type Server } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";

/** One in-memory, one-use Matrix callback. Never accept a homeserver from HTTP. */
export class SsoCallback {
  private server: Server | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private generation = 0;

  constructor(private readonly deliver: (url: string) => void, private readonly timeoutMs = 10 * 60_000) {}

  cancel(): void {
    this.generation++;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.server?.close();
    this.server?.closeAllConnections();
    this.server = null;
  }

  async prepare(mode: "sso" | "oauth" = "sso"): Promise<string> {
    this.cancel();
    const generation = this.generation;
    const state = randomBytes(32).toString("hex");
    let callback: URL;
    const server = createServer((request, response) => {
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("Referrer-Policy", "no-referrer");
      response.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
      response.setHeader("Content-Type", "text/plain; charset=utf-8");
      let url: URL;
      try { url = new URL(request.url ?? "", callback.origin); }
      catch { response.writeHead(400).end("Invalid callback."); return; }
      const received = url.searchParams.get("state") ?? "";
      if (request.method !== "GET" || request.headers.host !== callback.host || url.origin !== callback.origin || url.pathname !== callback.pathname || url.hash ||
          url.searchParams.getAll("state").length !== 1 || Buffer.byteLength(received) !== Buffer.byteLength(state) || !timingSafeEqual(Buffer.from(received), Buffer.from(state)) || generation !== this.generation) {
        response.writeHead(400).end("Invalid sign-in callback."); return;
      }
      const credential = mode === "oauth" ? "code" : "loginToken";
      if (url.searchParams.getAll(credential).length !== 1 || !url.searchParams.get(credential) || url.searchParams.has("error")) {
        url = new URL(callback);
        url.searchParams.set("error", "SSO failed or was cancelled. Please try again.");
      }
      response.end("Return to Grungus to finish signing in. You can close this tab.");
      // Stop accepting callbacks immediately, but allow this response to finish.
      this.generation++;
      if (this.timer) clearTimeout(this.timer);
      this.timer = null;
      server.close();
      server.closeIdleConnections();
      response.once("finish", () => server.closeAllConnections());
      this.server = null;
      this.deliver(url.href);
    });
    this.server = server;
    server.requestTimeout = 5000;
    server.headersTimeout = 5000;
    try {
      await new Promise<void>((resolve, reject) => {
        const closed = () => reject(new Error("Browser login cancelled."));
        server.once("error", reject);
        server.once("close", closed);
        server.listen(0, "127.0.0.1", () => {
          server.removeListener("error", reject);
          server.removeListener("close", closed);
          resolve();
        });
      });
    } catch (error) {
      if (generation === this.generation) this.cancel();
      throw error;
    }
    if (generation !== this.generation) { server.close(); throw new Error("Browser login cancelled."); }
    const address = server.address();
    if (!address || typeof address === "string") { this.cancel(); throw new Error("Unable to start SSO callback listener."); }
    callback = new URL(`http://127.0.0.1:${address.port}/matrix-sso/callback`);
    callback.searchParams.set("state", state);
    const fail = (message: string) => {
      if (generation !== this.generation) return;
      this.cancel();
      const failure = new URL(callback);
      failure.searchParams.set("error", message);
      this.deliver(failure.href);
    };
    server.on("error", () => fail("SSO callback listener failed. Please try again."));
    this.timer = setTimeout(() => fail("Browser sign-in expired. Please try again."), this.timeoutMs);
    this.timer.unref();
    return callback.href;
  }
}
