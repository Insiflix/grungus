import { useEffect, useSyncExternalStore } from "react";
import type { MatrixMessage } from "../../../domain/matrix/MatrixTypes";

export interface DraftSelection { start: number; end: number; direction: "forward" | "backward" | "none" }
export interface RoomDraft { body: string; files: { id: string; file: File }[]; reply: MatrixMessage | null; selection?: DraftSelection; hydrated?: boolean; sending?: boolean; storageError?: string }
const empty: RoomDraft = { body: "", files: [], reply: null };
class RoomDraftStore {
  private drafts = new Map<string, RoomDraft>();
  private dirty = new Map<string, Set<keyof RoomDraft>>();
  private loads = new Map<string, Promise<void>>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private listeners = new Set<() => void>();
  private database?: Promise<IDBDatabase>;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  get = (key?: string) => key ? this.drafts.get(key) ?? empty : empty;
  private publish() { for (const listener of this.listeners) listener(); }
  private db() {
    return this.database ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("grungus-room-drafts", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("drafts");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  load(key: string) {
    if (this.loads.has(key)) return this.loads.get(key)!;
    const job = (async () => {
      try {
        const db = await this.db();
        const saved = await new Promise<RoomDraft | undefined>((resolve, reject) => {
          const request = db.transaction("drafts").objectStore("drafts").get(key);
          request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
        });
        const next = saved ? { ...empty, ...saved } : { ...this.get(key) };
        for (const field of this.dirty.get(key) ?? []) Object.assign(next, { [field]: this.get(key)[field] });
        next.hydrated = true;
        this.drafts.set(key, next); this.publish();
      } catch { this.storageFailed(key); }
    })();
    this.loads.set(key, job); return job;
  }
  patch(key: string | undefined, patch: Partial<RoomDraft>) {
    if (!key) return;
    const fields = this.dirty.get(key) ?? new Set<keyof RoomDraft>();
    for (const field of Object.keys(patch) as (keyof RoomDraft)[]) fields.add(field);
    this.dirty.set(key, fields);
    this.drafts.set(key, { ...this.get(key), ...patch }); this.publish();
    clearTimeout(this.timers.get(key));
    this.timers.set(key, setTimeout(() => { void this.persist(key); }, 250));
  }
  private storageFailed(key: string) {
    this.drafts.set(key, { ...this.get(key), hydrated: true, storageError: "Draft kept for this session; local storage is unavailable." }); this.publish();
  }
  async persist(key: string) {
    try {
      await this.load(key);
      const db = await this.db();
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction("drafts", "readwrite");
        const { storageError: _, sending: _sending, hydrated: _hydrated, ...draft } = this.get(key);
        if (!draft.body && !draft.files.length && !draft.reply) transaction.objectStore("drafts").delete(key);
        else transaction.objectStore("drafts").put(draft, key);
        transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error);
      });
    } catch { this.storageFailed(key); }
  }
}
export const roomDrafts = new RoomDraftStore();
export function useRoomDraft(key?: string) {
  const draft = useSyncExternalStore(roomDrafts.subscribe, () => roomDrafts.get(key));
  useEffect(() => { if (key) void roomDrafts.load(key); }, [key]);
  return draft;
}
