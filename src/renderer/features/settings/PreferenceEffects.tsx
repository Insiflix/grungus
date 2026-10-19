import { useEffect } from "react";
import { preferences } from "../../../domain/settings/Preferences";
import { usePreferences } from "../../hooks/usePreferences";

export function PreferenceEffects() {
  const prefs = usePreferences();
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = prefs.theme;
    root.dataset.compact = String(prefs.compact);
    root.dataset.reduceMotion = String(prefs.reduceMotion);
    root.dataset.avatars = String(prefs.showAvatars);
    root.dataset.timestamps = String(prefs.showTimestamps);
    root.dataset.roomPreviews = String(prefs.showRoomPreviews);
    root.style.setProperty("--chat-font-size", `${prefs.fontSize}px`);
  }, [prefs]);
  useEffect(() => {
    const reload = () => preferences.reload();
    window.addEventListener("storage", reload);
    return () => window.removeEventListener("storage", reload);
  }, []);
  return null;
}
