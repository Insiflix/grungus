export interface PersistedMatrixSession {
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
  session: {
    load(): Promise<PersistedMatrixSession | null>;
    save(session: PersistedMatrixSession): Promise<SessionStoreResult>;
    remove(): Promise<void>;
  };
  auth: {
    openExternal(url: string): Promise<void>;
    onCallback(listener: (url: string) => void): () => void;
  };
  platform: NodeJS.Platform;
}
