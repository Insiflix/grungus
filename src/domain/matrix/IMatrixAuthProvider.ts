import type {
  MatrixAuthCapabilities,
  MatrixSession,
} from "./MatrixTypes";

export interface BrowserLoginRequest {
  identityProviderId?: string;
}

export interface IMatrixAuthProvider {
  discover(serverNameOrUrl: string): Promise<MatrixAuthCapabilities>;
  loginWithPassword(
    capabilities: MatrixAuthCapabilities,
    user: string,
    password: string,
  ): Promise<MatrixSession>;
  startBrowserLogin(
    capabilities: MatrixAuthCapabilities,
    request?: BrowserLoginRequest,
  ): Promise<void>;
  completeBrowserLogin(callbackUrl: string): Promise<MatrixSession>;
  restoreSession(): Promise<MatrixSession | null>;
  persistSession(session: MatrixSession): Promise<string | null>;
  clearSession(): Promise<void>;
  subscribeToBrowserCallback(listener: (url: string) => void): () => void;
}
