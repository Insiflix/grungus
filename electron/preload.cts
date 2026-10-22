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
  notifications: {
    isSupported: () => ipcRenderer.invoke("notifications:supported"),
    show: value => ipcRenderer.invoke("notifications:show", value),
    onOpenRoom: listener => {
      const callback = (_event: Electron.IpcRendererEvent, roomId: string) => listener(roomId);
      ipcRenderer.on("notifications:open-room", callback);
      return () => { ipcRenderer.removeListener("notifications:open-room", callback); };
    },
  },
  windowControls: {
    getState: () => ipcRenderer.invoke("window:state"),
    minimize: () => ipcRenderer.invoke("window:minimize"),
    toggleMaximize: () => ipcRenderer.invoke("window:toggle-maximize"),
    close: () => ipcRenderer.invoke("window:close"),
    onStateChange: listener => {
      const callback = (_event: Electron.IpcRendererEvent, state: { maximized: boolean }) => listener(state);
      ipcRenderer.on("window:state-changed", callback);
      return () => { ipcRenderer.removeListener("window:state-changed", callback); };
    },
  },
  clipboard: { writeText: (text: string) => ipcRenderer.invoke("clipboard:write-text", text), writeImage: (png: Uint8Array) => ipcRenderer.invoke("clipboard:write-image", png) },
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
  capture: {
    onRequest: (listener) => { const callback = (_event: Electron.IpcRendererEvent, request: Parameters<typeof listener>[0]) => listener(request); ipcRenderer.on("desktop-capture:request", callback); return () => { ipcRenderer.removeListener("desktop-capture:request", callback); }; },
    onDismiss: (listener) => { const callback = (_event: Electron.IpcRendererEvent, id: string) => listener(id); ipcRenderer.on("desktop-capture:dismiss", callback); return () => { ipcRenderer.removeListener("desktop-capture:dismiss", callback); }; },
    respond: (requestId, sourceId, audio) => ipcRenderer.invoke("desktop-capture:respond", requestId, sourceId, audio),
  },
  platform: process.platform,
};

contextBridge.exposeInMainWorld("desktop", bridge);

