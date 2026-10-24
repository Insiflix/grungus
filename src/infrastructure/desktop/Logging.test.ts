import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { BrowserWindow, IpcMain, IpcMainInvokeEvent } from "electron";
import { captureMainConsole, logDirectory, redactLog, RotatingLog, LOG_MAX_AGE_MS } from "../../../electron/logging";
import { registerLoggingIpc } from "../../../electron/loggingIpc";

let directory: string;
const logs: RotatingLog[] = [];
const create = (options?: ConstructorParameters<typeof RotatingLog>[1]) => {
  const log = new RotatingLog(directory, options); logs.push(log); return log;
};
const contents = () => readdirSync(directory).filter(name => name.endsWith(".log")).map(name => readFileSync(path.join(directory, name), "utf8")).join("");
beforeEach(() => { directory = mkdtempSync(path.join(tmpdir(), "grungus-logs-")); });
afterEach(() => { logs.splice(0).forEach(log => log.close()); vi.useRealTimers(); vi.restoreAllMocks(); rmSync(directory, { recursive: true, force: true }); });

describe("bounded persistent logs", () => {
  it("uses platform state directories and isolates development", () => {
    expect(logDirectory("win32", { LOCALAPPDATA: "C:\\Users\\me\\AppData\\Local" }, "C:\\Users\\me", false)).toBe("C:\\Users\\me\\AppData\\Local\\Grungus\\logs");
    expect(logDirectory("linux", { XDG_STATE_HOME: "/state" }, "/home/me", false)).toBe(path.join("/state", "grungus", "logs"));
    expect(logDirectory("linux", { XDG_STATE_HOME: "relative" }, "/home/me", true)).toBe(path.join("/home/me", ".local", "state", "grungus-dev", "logs"));
    expect(logDirectory("darwin", {}, "/Users/me", false)).toBe(path.join("/Users/me", "Library", "Logs", "Grungus"));
  });

  it("keeps the newest entries within the file count and byte limits, including multibyte text", () => {
    const log = create({ maxBytes: 512 });
    for (let i = 0; i < 30; i++) log.write("info", "renderer", `entry-${i} ${"🐸".repeat(200)}`);
    log.flush();
    const files = readdirSync(directory);
    expect(files).toHaveLength(5);
    for (const file of files) expect(statSync(path.join(directory, file)).size).toBeLessThanOrEqual(512);
    expect(contents()).toContain("entry-29");
    expect(contents()).not.toContain("entry-0 ");
  });

  it("appends across restarts and rotates the previous day's logs", () => {
    const first = create(); first.write("warning", "main", "before restart"); first.close();
    const second = create(); second.write("info", "main", "after restart"); second.close();
    expect(readFileSync(path.join(directory, "grungus.log"), "utf8")).toContain("before restart");
    let now = Date.now();
    const third = create({ now: () => now });
    now += 24 * 60 * 60 * 1000;
    third.write("error", "main", "next day"); third.flush();
    expect(readFileSync(path.join(directory, "grungus.1.log"), "utf8")).toContain("after restart");
    expect(readFileSync(path.join(directory, "grungus.log"), "utf8")).toContain("next day");
  });

  it("removes expired files at startup and during an idle running session", () => {
    vi.useFakeTimers();
    const old = path.join(directory, "grungus.1.log");
    const unrelated = path.join(directory, "keep.txt");
    writeFileSync(old, "expired"); writeFileSync(unrelated, "leave alone");
    const expired = new Date(Date.now() - LOG_MAX_AGE_MS - 1);
    utimesSync(old, expired, expired);
    const log = create();
    expect(readdirSync(directory)).toEqual(["keep.txt"]);
    log.write("info", "main", "will expire"); log.flush();
    vi.advanceTimersByTime(LOG_MAX_AGE_MS + 60 * 60 * 1000);
    expect(readdirSync(directory)).toEqual(["keep.txt"]);
  });

  it("bounds pending memory during a burst, reports dropped entries, and flushes on close", () => {
    const log = create();
    for (let i = 0; i < 1000; i++) log.write("error", "renderer", "x".repeat(2048));
    log.close();
    expect(contents()).toMatch(/Dropped \d+ log entries/);
    expect(statSync(path.join(directory, "grungus.log")).size).toBeLessThan(257 * 1024);
    log.write("error", "main", "after close"); log.flush();
    expect(contents()).not.toContain("after close");
  });

  it("leaves callers running if the log directory is unwritable", () => {
    const onError = vi.fn();
    const file = path.join(directory, "not-a-directory"); writeFileSync(file, "occupied");
    const log = new RotatingLog(file, { onError }); logs.push(log);
    expect(() => { log.write("error", "main", "failure"); log.close(); }).not.toThrow();
    expect(onError).toHaveBeenCalledOnce();
  });

  it("masks credentials before writing and retains useful error stacks", () => {
    const log = create();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const restore = captureMainConsole(log);
    try { console.warn("Failed request", { accessToken: "token-secret", refresh_token: "refresh-secret", password: "many secret words" }, new Error("network unavailable")); }
    finally { restore(); }
    log.write("error", "renderer", 'https://matrix.example/?access_token=url-secret&code=code-secret Authorization: Bearer bearer-secret');
    log.write("debug", "renderer", "verbose output");
    log.flush();
    const text = contents();
    expect(warn).toHaveBeenCalledOnce();
    for (const value of ["token-secret", "refresh-secret", "many secret words", "url-secret", "code-secret", "bearer-secret", "verbose output"]) expect(text).not.toContain(value);
    expect(text).toContain("network unavailable"); expect(text).toContain("Logging.test.ts"); expect(text).toContain("[REDACTED]");
    expect(redactLog('https://me:secret@example.org syt_raw_token "client_secret": "oauth-secret"')).not.toMatch(/me:secret|syt_raw_token|oauth-secret/);
  });
});

describe("log folder desktop access", () => {
  function setup() {
    const handlers = new Map<string, (event: IpcMainInvokeEvent) => unknown>();
    const frame = { url: "grungus-app://client/index.html" };
    const window = { webContents: { mainFrame: frame } } as unknown as BrowserWindow;
    const event = { sender: window.webContents, senderFrame: frame } as unknown as IpcMainInvokeEvent;
    const open = vi.fn().mockResolvedValue("");
    registerLoggingIpc({ handle: (name: string, handler: (event: IpcMainInvokeEvent) => unknown) => handlers.set(name, handler) } as unknown as IpcMain, () => window, url => url.startsWith("grungus-app://client/"), create(), open);
    return { handlers, event, open };
  }
  it("opens only the configured log folder and reports OS errors", async () => {
    const { handlers, event, open } = setup();
    expect(handlers.get("logs:path")!(event)).toBe(directory);
    await handlers.get("logs:open")!(event);
    expect(open).toHaveBeenCalledWith(directory);
    open.mockResolvedValue("No file manager available");
    await expect(handlers.get("logs:open")!(event)).rejects.toThrow("No file manager");
  });
  it("rejects embedded frames and other windows", async () => {
    const { handlers, event, open } = setup();
    const untrusted = { ...event, senderFrame: { url: "grungus-app://call/element-call/index.html" } } as IpcMainInvokeEvent;
    expect(() => handlers.get("logs:path")!(untrusted)).toThrow("Untrusted");
    await expect(handlers.get("logs:open")!({ ...event, sender: {} } as IpcMainInvokeEvent)).rejects.toThrow("Untrusted");
    expect(open).not.toHaveBeenCalled();
  });
});
