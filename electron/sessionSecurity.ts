import type { PersistedMatrixSession } from "./shared/session.js";
import { secureHomeserverUrl } from "./shared/urls.js";

/** Preserve IPC request order so a late save cannot resurrect a removed session. */
export class SessionOperationQueue {
  private tail: Promise<unknown> = Promise.resolve();
  run<T>(action: () => Promise<T>): Promise<T> {
    const result = this.tail.catch(() => undefined).then(action);
    this.tail = result;
    return result;
  }
}

export function secureStorageAvailable(storage: { isEncryptionAvailable(): boolean; getSelectedStorageBackend?(): string }, platform: string): boolean {
  return storage.isEncryptionAvailable() && (platform !== "linux" || storage.getSelectedStorageBackend?.() !== "basic_text");
}

export function isPersistedSession(value: unknown): value is PersistedMatrixSession {
  if (!value || typeof value !== "object") return false;
  const session = value as Record<string, unknown>;
  if (!["homeserverUrl", "serverName", "accessToken", "userId", "deviceId"].every(key => typeof session[key] === "string" && (session[key] as string).length > 0 && (session[key] as string).length < 65536) || (session.refreshToken !== undefined && typeof session.refreshToken !== "string")) return false;
  try { secureHomeserverUrl(session.homeserverUrl as string); return true; } catch { return false; }
}
