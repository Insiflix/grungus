export interface MatrixOAuthSession {
  issuer: string;
  clientId: string;
}

export interface PersistedMatrixSession {
  oauth?: MatrixOAuthSession;
  homeserverUrl: string;
  serverName: string;
  accessToken: string;
  refreshToken?: string;
  userId: string;
  deviceId: string;
}

export interface SessionStoreResult {
  persisted: boolean;
  reason?: string;
}

export interface DesktopBridge {
  logs: {
    getPath(): Promise<string>;
    openFolder(): Promise<void>;
  };
  notifications: {
    isSupported(): Promise<boolean>;
    show(notification: DesktopNotification): Promise<void>;
    onOpenRoom(listener: (roomId: string) => void): () => void;
  };
  windowControls: {
    getState(): Promise<{ maximized: boolean }>;
    minimize(): Promise<void>;
    toggleMaximize(): Promise<void>;
    close(): Promise<void>;
    onStateChange(listener: (state: { maximized: boolean }) => void): () => void;
  };
  clipboard: { writeText(text: string): Promise<void>; writeImage(png: Uint8Array): Promise<void> };
  session: {
    load(): Promise<PersistedMatrixSession | null>;
    save(session: PersistedMatrixSession): Promise<SessionStoreResult>;
    remove(): Promise<void>;
  };
  auth: {
    prepareSso(mode?: "sso" | "oauth"): Promise<string>;
    cancelSso(): Promise<void>;
    openExternal(url: string): Promise<void>;
    onCallback(listener: (url: string) => void): () => void;
  };
  capture: {
    onRequest(listener: (request: ScreenShareRequest) => void): () => void;
    onDismiss(listener: (requestId: string) => void): () => void;
    respond(requestId: string, sourceId: string | null, audio: boolean): Promise<void>;
  };
  platform: NodeJS.Platform;
}

export interface DesktopNotification { title: string; body: string; silent: boolean; roomId?: string; iconDataUrl?: string }

export interface ScreenShareSource { id: string; name: string; kind: "screen" | "window"; thumbnail: string; icon?: string }
export interface ScreenShareRequest { id: string; sources: ScreenShareSource[]; audioRequested: boolean; systemAudioSupported: boolean }
