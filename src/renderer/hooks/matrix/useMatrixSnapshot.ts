import { useSyncExternalStore } from "react";
import { useMatrixRuntime } from "../../app/providers/MatrixProvider";

export function useMatrixSnapshot() {
  const runtime = useMatrixRuntime();
  return useSyncExternalStore(
    runtime.subscribe,
    runtime.getSnapshot,
    runtime.getSnapshot,
  );
}
