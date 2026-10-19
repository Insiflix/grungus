import { useEffect, useRef, useState } from "react";

/** Optimistic controls stay interactive; writes are serialized and coalesce rapid changes. */
export function useQueuedSetting<T>(confirmed: T, save: (value: T) => Promise<unknown>) {
  const [optimistic, setOptimistic] = useState<{ value: T } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const queued = useRef<{ value: T } | null>(null);
  const running = useRef(false);
  const saveRef = useRef(save);
  saveRef.current = save;
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const change = (value: T) => {
    queued.current = { value };
    setOptimistic({ value }); setError(null);
    if (running.current) return;
    running.current = true; setSaving(true);
    void (async () => {
      while (queued.current) {
        const next = queued.current;
        queued.current = null;
        try { await saveRef.current(next.value); }
        catch (cause) {
          if (mounted.current && !queued.current) setError(cause instanceof Error ? cause.message : "Unable to save this setting.");
        }
      }
      running.current = false;
      if (mounted.current) { setOptimistic(null); setSaving(false); }
    })();
  };
  return { value: optimistic ? optimistic.value : confirmed, change, saving, error };
}
