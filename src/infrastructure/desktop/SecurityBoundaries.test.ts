import { describe, expect, it } from "vitest";
import type { BrowserWindow, IpcMainInvokeEvent } from "electron";
import { assertTrustedAppSender } from "../../../electron/ipcSecurity";
import { isPersistedSession, secureStorageAvailable, SessionOperationQueue } from "../../../electron/sessionSecurity";
import { secureExternalUrl, secureHomeserverUrl } from "../../../electron/shared/urls";

describe("desktop security boundaries", () => {
  it("orders credential writes and logout removal, including after a failed write", async () => {
    const queue = new SessionOperationQueue();
    let finish!: () => void;
    let stored: string | null = null;
    const saving = queue.run(async () => { await new Promise<void>(resolve => { finish = resolve; }); stored = "old-token"; });
    const removing = queue.run(async () => { stored = null; });
    await Promise.resolve(); await Promise.resolve();
    finish(); await Promise.all([saving, removing]);
    expect(stored).toBeNull();
    await expect(queue.run(async () => { throw new Error("disk full"); })).rejects.toThrow("disk full");
    await queue.run(async () => { stored = "new-token"; });
    expect(stored).toBe("new-token");
  });
  it("permits only the application main frame to access sensitive IPC", () => {
    const frame = { url: "grungus-app://client/index.html" };
    const contents = { mainFrame: frame };
    const window = { webContents: contents } as unknown as BrowserWindow;
    const event = { sender: contents, senderFrame: frame } as unknown as IpcMainInvokeEvent;
    const trusted = (url: string) => new URL(url).hostname === "client";
    expect(() => assertTrustedAppSender(event, window, trusted)).not.toThrow();
    expect(() => assertTrustedAppSender({ ...event, senderFrame: { url: frame.url } } as IpcMainInvokeEvent, window, trusted)).toThrow("Untrusted");
    expect(() => assertTrustedAppSender({ ...event, sender: {} } as IpcMainInvokeEvent, window, trusted)).toThrow("Untrusted");
    frame.url = "grungus-app://client/element-call/index.html";
    expect(() => assertTrustedAppSender(event, window, trusted)).toThrow("main application");
    frame.url = "https://attacker.example/index.html";
    expect(() => assertTrustedAppSender(event, window, trusted)).toThrow("Untrusted");
    expect(() => assertTrustedAppSender(event, null, trusted)).toThrow("Untrusted");
  });

  it("does not mistake Linux's plaintext fallback for OS credential encryption", () => {
    const storage = { isEncryptionAvailable: () => true, getSelectedStorageBackend: () => "basic_text" };
    expect(secureStorageAvailable(storage, "linux")).toBe(false);
    expect(secureStorageAvailable({ ...storage, getSelectedStorageBackend: () => "gnome_libsecret" }, "linux")).toBe(true);
    expect(secureStorageAvailable(storage, "win32")).toBe(true);
    expect(secureStorageAvailable({ isEncryptionAvailable: () => false }, "win32")).toBe(false);
  });

  it.each(["http://matrix.example.org", "https://user:password@example.org", "https://example.org/?token=secret", "https://example.org/#token", "file:///tmp/session", "javascript:alert(1)"])("rejects unsafe homeservers: %s", url => {
    expect(() => secureHomeserverUrl(url)).toThrow();
  });
  it.each(["http://localhost:8008", "http://127.0.0.1:8008", "http://[::1]:8008", "https://matrix.example.org/matrix"])("preserves explicit local development and HTTPS: %s", url => {
    expect(secureHomeserverUrl(url)).toBe(url);
  });
  it("validates persisted tokens and external URLs before use", () => {
    const session = { homeserverUrl: "https://example.org", serverName: "example.org", accessToken: "test", userId: "@test:example.org", deviceId: "TEST" };
    expect(isPersistedSession(session)).toBe(true);
    expect(isPersistedSession({ ...session, homeserverUrl: "http://remote.example.org" })).toBe(false);
    expect(isPersistedSession({ ...session, accessToken: "" })).toBe(false);
    expect(secureExternalUrl("https://example.org/login")).toBe("https://example.org/login");
    expect(() => secureExternalUrl("https://me:secret@example.org/login")).toThrow();
    expect(() => secureExternalUrl("file:///private.txt")).toThrow();
  });
});
