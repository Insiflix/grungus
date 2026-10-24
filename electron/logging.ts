import { appendFileSync, mkdirSync, renameSync, statSync, unlinkSync } from "node:fs";
import path from "node:path";
import { formatWithOptions } from "node:util";

export const LOG_FILE_BYTES = 2 * 1024 * 1024;
export const LOG_FILE_COUNT = 5;
export const LOG_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_RECORD_BYTES = 16 * 1024;
const MAX_PENDING_BYTES = 256 * 1024;
export type LogLevel = "info" | "warning" | "error" | "debug";

export function logDirectory(platform: NodeJS.Platform, env: NodeJS.ProcessEnv, home: string, development: boolean): string {
  const name = development ? "Grungus Dev" : "Grungus";
  if (platform === "win32") return path.win32.join(env.LOCALAPPDATA || path.win32.join(home, "AppData", "Local"), name, "logs");
  if (platform === "darwin") return path.join(home, "Library", "Logs", name);
  const state = env.XDG_STATE_HOME;
  return path.join(state && path.isAbsolute(state) ? state : path.join(home, ".local", "state"), development ? "grungus-dev" : "grungus", "logs");
}

/** Sanitize before truncating: cutting first could expose part of a credential. */
export function redactLog(value: string): string {
  return value
    .replace(/\bBearer\s+[^\s"',;)}]+/gi, "Bearer [REDACTED]")
    .replace(/(\b(?:access[_-]?token|refresh[_-]?token|id[_-]?token|login[_-]?token|password|passwd|authorization|client[_-]?secret|api[_-]?key|recovery[_-]?key|private[_-]?key)\b["']?\s*[:=]\s*)(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,;&}\]]+)/gi, "$1[REDACTED]")
    .replace(/([?&#](?:code|token|key|secret)=)[^\s&#"']*/gi, "$1[REDACTED]")
    .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, "$1[REDACTED]@")
    .replace(/\bsyt_[A-Za-z0-9_-]+/g, "[REDACTED]");
}

/** Bounded batches keep disk IO out of console calls; shutdown/crash can flush synchronously. */
export class RotatingLog {
  private pending: string[] = [];
  private pendingBytes = 0;
  private dropped = 0;
  private scheduled: NodeJS.Immediate | undefined;
  private failed = false;
  private closed = false;
  private bytes = 0;
  private day = "";
  private cleanupTimer: NodeJS.Timeout | undefined;

  constructor(readonly directory: string, private readonly options: {
    maxBytes?: number; fileCount?: number; maxAgeMs?: number; now?: () => number;
    onError?: (error: unknown) => void;
  } = {}) {
    try {
      mkdirSync(directory, { recursive: true, mode: 0o700 });
      this.prune();
      const existing = this.stat(this.file(0));
      this.bytes = existing?.size ?? 0;
      this.day = new Date(existing?.mtimeMs ?? this.now()).toISOString().slice(0, 10);
      this.cleanupTimer = setInterval(() => this.cleanup(), 60 * 60 * 1000);
      this.cleanupTimer.unref();
    } catch (error) { this.fail(error); }
  }

  private now(): number { return this.options.now?.() ?? Date.now(); }
  private file(index: number): string { return path.join(this.directory, index === 0 ? "grungus.log" : `grungus.${index}.log`); }
  private stat(file: string) {
    try { return statSync(file); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; return undefined; }
  }
  private remove(file: string): void {
    try { unlinkSync(file); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
  private prune(): void {
    for (let i = 0; i < (this.options.fileCount ?? LOG_FILE_COUNT); i++) {
      const file = this.file(i);
      const stat = this.stat(file);
      if (stat && this.now() - stat.mtimeMs >= (this.options.maxAgeMs ?? LOG_MAX_AGE_MS)) this.remove(file);
    }
  }
  private cleanup(): void {
    if (this.failed || this.closed) return;
    try { this.prune(); this.bytes = this.stat(this.file(0))?.size ?? 0; } catch (error) { this.fail(error); }
  }
  private rotate(): void {
    const count = this.options.fileCount ?? LOG_FILE_COUNT;
    this.remove(this.file(count - 1));
    for (let i = count - 2; i >= 0; i--) {
      if (this.stat(this.file(i))) renameSync(this.file(i), this.file(i + 1));
    }
    this.bytes = 0;
  }
  private fail(error: unknown): void {
    this.failed = true;
    this.pending = []; this.pendingBytes = 0;
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    this.options.onError?.(error);
  }

  write(level: LogLevel, source: string, message: string): void {
    if (this.failed || this.closed || level === "debug") return;
    const prefix = `${new Date(this.now()).toISOString()} [${level.toUpperCase()}] [${source}] `;
    const limit = Math.max(0, Math.min(MAX_RECORD_BYTES, this.options.maxBytes ?? LOG_FILE_BYTES) - Buffer.byteLength(prefix) - 20);
    let text = redactLog(message).replace(/\r/g, "").replace(/\n/g, "\n    ");
    if (Buffer.byteLength(text) > limit) text = Buffer.from(text).subarray(0, limit).toString("utf8") + " [truncated]";
    const line = prefix + text + "\n";
    const size = Buffer.byteLength(line);
    if (this.pendingBytes + size > MAX_PENDING_BYTES) this.dropped++;
    else { this.pending.push(line); this.pendingBytes += size; }
    this.scheduled ??= setImmediate(() => this.flush());
  }

  flush(): void {
    if (this.scheduled) clearImmediate(this.scheduled);
    this.scheduled = undefined;
    if (this.failed || this.closed) return;
    const lines = this.pending;
    this.pending = []; this.pendingBytes = 0;
    if (this.dropped) {
      lines.push(`${new Date(this.now()).toISOString()} [WARNING] [logging] Dropped ${this.dropped} log entries during a logging burst.\n`);
      this.dropped = 0;
    }
    try {
      const day = new Date(this.now()).toISOString().slice(0, 10);
      let batch = "";
      for (const line of lines) {
        if (this.bytes + Buffer.byteLength(batch) + Buffer.byteLength(line) > (this.options.maxBytes ?? LOG_FILE_BYTES) || this.day !== day) {
          if (batch) appendFileSync(this.file(0), batch, { mode: 0o600 });
          batch = "";
          this.rotate(); this.day = day;
        }
        batch += line;
      }
      if (batch) { appendFileSync(this.file(0), batch, { mode: 0o600 }); this.bytes += Buffer.byteLength(batch); }
    } catch (error) { this.fail(error); }
  }

  close(): void {
    this.flush(); this.closed = true;
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
  }
}

export function captureMainConsole(log: RotatingLog): () => void {
  const methods = ["log", "info", "warn", "error", "debug"] as const;
  const originals = methods.map(method => console[method]);
  methods.forEach((method, index) => {
    console[method] = (...args: unknown[]) => {
      originals[index].apply(console, args);
      try {
        log.write(method === "warn" ? "warning" : method === "log" ? "info" : method, "main", formatWithOptions({ depth: 4, maxArrayLength: 30, maxStringLength: MAX_RECORD_BYTES, customInspect: false, getters: false }, ...args));
      } catch { /* Logging must not break the caller. */ }
    };
  });
  return () => methods.forEach((method, index) => { console[method] = originals[index]; });
}
