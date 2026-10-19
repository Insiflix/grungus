import { useSyncExternalStore } from "react";
import { preferences } from "../../domain/settings/Preferences";

export function usePreferences() {
  return useSyncExternalStore(preferences.subscribe, preferences.getSnapshot, preferences.getSnapshot);
}
