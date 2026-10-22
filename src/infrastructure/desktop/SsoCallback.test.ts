// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { SsoCallback } from "../../../electron/ssoCallback";

const listeners: SsoCallback[] = [];
afterEach(() => { for (const listener of listeners.splice(0)) listener.cancel(); });
function setup(timeout?: number) {
  const deliver = vi.fn();
  const listener = new SsoCallback(deliver, timeout);
  listeners.push(listener);
  return { listener, deliver };
}

describe("loopback SSO callback", () => {
  it("binds a random loopback port, rejects forged callbacks, and consumes the valid token once", async () => {
    const { listener, deliver } = setup();
    const callback = new URL(await listener.prepare());
    expect(callback.hostname).toBe("127.0.0.1");
    expect(Number(callback.port)).toBeGreaterThan(0);
    expect(callback.searchParams.get("state")).toMatch(/^[a-f0-9]{64}$/);
    for (const modify of [
      (url: URL) => url.searchParams.delete("state"),
      (url: URL) => url.searchParams.set("state", "x".repeat(64)),
      (url: URL) => url.searchParams.set("state", "é".repeat(64)),
      (url: URL) => url.searchParams.append("state", callback.searchParams.get("state")!),
      (url: URL) => { url.pathname = "/wrong"; },
    ]) {
      const forged = new URL(callback); modify(forged);
      expect((await fetch(forged)).status).toBe(400);
    }
    expect((await fetch(callback, { method: "POST" })).status).toBe(400);
    expect(deliver).not.toHaveBeenCalled();
    callback.searchParams.set("loginToken", "single-use-token");
    const response = await fetch(callback);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).not.toContain("single-use-token");
    expect(deliver).toHaveBeenCalledExactlyOnceWith(callback.href);
    await expect(fetch(callback)).rejects.toThrow();
  });

  it("closes the socket on cancellation and replaces attempts with fresh state", async () => {
    const { listener, deliver } = setup();
    const first = new URL(await listener.prepare());
    const next = new URL(await listener.prepare());
    expect(next.searchParams.get("state")).not.toBe(first.searchParams.get("state"));
    await expect(fetch(first)).rejects.toThrow();
    listener.cancel();
    await expect(fetch(next)).rejects.toThrow();
    expect(deliver).not.toHaveBeenCalled();
  });

  it("settles a listener creation cancelled before binding completes", async () => {
    const { listener, deliver } = setup();
    const preparing = listener.prepare();
    listener.cancel();
    await expect(preparing).rejects.toThrow("cancelled");
    expect(deliver).not.toHaveBeenCalled();
  });

  it("accepts a one-use OAuth code in OAuth mode", async () => {
    const { listener, deliver } = setup();
    const callback = new URL(await listener.prepare("oauth"));
    callback.searchParams.set("code", "authorization-code");
    const response = await fetch(callback);
    expect(response.status).toBe(200);
    expect(deliver).toHaveBeenCalledExactlyOnceWith(callback.href);
    await expect(fetch(callback)).rejects.toThrow();
  });

  it("does not accept an OAuth code on a Matrix SSO listener", async () => {
    const { listener, deliver } = setup();
    const callback = new URL(await listener.prepare("sso"));
    callback.searchParams.set("code", "wrong-flow");
    await fetch(callback);
    expect(new URL(deliver.mock.calls[0][0]).searchParams.has("error")).toBe(true);
  });

  it("reports timeout and releases its listener", async () => {
    const { listener, deliver } = setup(30);
    const callback = await listener.prepare();
    await vi.waitFor(() => expect(deliver).toHaveBeenCalledOnce());
    expect(new URL(deliver.mock.calls[0][0]).searchParams.get("error")).toContain("expired");
    await expect(fetch(callback)).rejects.toThrow();
  });

  it.each(["", "?error=access_denied", "?loginToken=a&loginToken=b"])("handles missing, denied or duplicate tokens: %s", async query => {
    const { listener, deliver } = setup();
    const callback = await listener.prepare();
    await fetch(callback + query.replace("?", "&"));
    expect(new URL(deliver.mock.calls[0][0]).searchParams.get("error")).toContain("failed");
    await expect(fetch(callback)).rejects.toThrow();
  });
});
