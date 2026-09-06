import { contextBridge, ipcRenderer } from "electron";
import type {
  DesktopBridge,
  PersistedMatrixSession,
} from "./shared/session.js";

const authCallbacks: string[] = [];
const authListeners = new Set<(url: string) => void>();

ipcRenderer.on("matrix-auth:callback", (_event, url: string) => {
  if (authListeners.size === 0) authCallbacks.push(url);
  else for (const listener of authListeners) listener(url);
});

const bridge: DesktopBridge = {
  session: {
    load: () => ipcRenderer.invoke("matrix-session:load"),
    save: (value: PersistedMatrixSession) =>
      ipcRenderer.invoke("matrix-session:save", value),
    remove: () => ipcRenderer.invoke("matrix-session:remove"),
  },
  auth: {
    openExternal: (url: string) =>
      ipcRenderer.invoke("matrix-auth:open-external", url),
    onCallback: (listener: (url: string) => void) => {
      authListeners.add(listener);
      for (const url of authCallbacks.splice(0)) listener(url);
      return () => authListeners.delete(listener);
    },
  },
  platform: process.platform,
};

contextBridge.exposeInMainWorld("desktop", bridge);

