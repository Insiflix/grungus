import type {
  MatrixAuthCapabilities,
  MatrixSession,
  MatrixRegistrationAuth,
  MatrixRegistrationResult,
} from "./MatrixTypes";

export interface BrowserLoginRequest {
  identityProviderId?: string;
  register?: boolean;
}

export interface IMatrixAuthProvider {
  register(capabilities: MatrixAuthCapabilities, username: string, password: string, auth?: MatrixRegistrationAuth): Promise<MatrixRegistrationResult>;
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
  cancelBrowserLogin(): Promise<void>;
  completeBrowserLogin(callbackUrl: string): Promise<MatrixSession>;
  restoreSession(): Promise<MatrixSession | null>;
  persistSession(session: MatrixSession): Promise<string | null>;
  clearSession(): Promise<void>;
  subscribeToBrowserCallback(listener: (url: string) => void): () => void;
}
