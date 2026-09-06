/// <reference types="vite/client" />

interface PersistedMatrixSession {
  homeserverUrl: string;
  serverName: string;
  accessToken: string;
  refreshToken?: string;
  userId: string;
  deviceId: string;
}

interface Window {
  readonly desktop?: {
    session: {
      load(): Promise<PersistedMatrixSession | null>;
      save(session: PersistedMatrixSession): Promise<{
        persisted: boolean;
        reason?: string;
      }>;
      remove(): Promise<void>;
    };
    auth: {
      openExternal(url: string): Promise<void>;
      onCallback(listener: (url: string) => void): () => void;
    };
    platform: string;
  };
}
