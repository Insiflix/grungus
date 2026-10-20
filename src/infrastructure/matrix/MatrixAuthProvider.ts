import {
  AutoDiscovery,
  AutoDiscoveryAction,
  createClient,
  getHttpUriForMxc,
  SSOAction,
  type LoginResponse,
} from "matrix-js-sdk";
import type {
  BrowserLoginRequest,
  IMatrixAuthProvider,
} from "../../domain/matrix/IMatrixAuthProvider";
import type {
  MatrixAuthCapabilities,
  MatrixSession,
  MatrixRegistrationAuth,
  MatrixRegistrationResult,
  MatrixRegistrationChallenge,
} from "../../domain/matrix/MatrixTypes";

const CALLBACK_URL = "grungus-matrix://auth/callback";
const DEVICE_NAME = "Grungus Matrix Desktop";
import { secureHomeserverUrl } from "../../../electron/shared/urls";

interface PendingBrowserLogin {
  capabilities: MatrixAuthCapabilities;
  state: string;
  expiresAt: number;
}

function normalizeServerName(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Enter a homeserver name or URL.");
  try {
    return new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`)
      .host;
  } catch {
    throw new Error("The homeserver name is not a valid domain or URL.");
  }
}

function normalizeDirectUrl(input: string): string {
  return secureHomeserverUrl(input.includes("://") ? input : `https://${input}`);
}

function sessionFromLogin(
  login: LoginResponse,
  capabilities: MatrixAuthCapabilities,
): MatrixSession {
  if (!login.access_token || !login.device_id) {
    throw new Error("The homeserver returned an incomplete login session.");
  }
  return {
    homeserverUrl: secureHomeserverUrl(capabilities.homeserverUrl),
    serverName: capabilities.serverName,
    accessToken: login.access_token,
    refreshToken: login.refresh_token,
    userId: login.user_id,
    deviceId: login.device_id,
  };
}

export class MatrixAuthProvider implements IMatrixAuthProvider {
  private pendingBrowserLogin: PendingBrowserLogin | null = null;

  async register(capabilities: MatrixAuthCapabilities, username: string, password: string, auth?: MatrixRegistrationAuth): Promise<MatrixRegistrationResult> {
    const localpart = username.trim();
    if (!localpart || localpart.includes(":") || localpart.startsWith("@")) {
      throw new Error("Enter a username without the @ or homeserver suffix.");
    }
    if (!password) throw new Error("Enter a password.");
    const client = createClient({ baseUrl: secureHomeserverUrl(capabilities.homeserverUrl) });
    try {
      const response = await client.registerRequest({
        username: localpart, password, auth,
        initial_device_display_name: DEVICE_NAME,
        refresh_token: true,
        inhibit_login: false,
      });
      if (!response.access_token || !response.device_id) {
        throw new Error("Account created. Sign in with your new username and password.");
      }
      return { session: sessionFromLogin({ ...response, access_token: response.access_token, device_id: response.device_id }, capabilities) };
    } catch (error) {
      const failure = error as { httpStatus?: number; data?: Partial<MatrixRegistrationChallenge> & { errcode?: string; error?: string } };
      if (failure.httpStatus === 401 && failure.data?.session && failure.data.flows?.length) {
        const challenge: MatrixRegistrationChallenge = {
          session: failure.data.session, flows: failure.data.flows, completed: failure.data.completed ?? [],
        };
        // A dummy stage needs no user input. Complete it only when it finishes a flow.
        if (auth?.type !== "m.login.dummy" && challenge.flows.some((flow) =>
          flow.stages.includes("m.login.dummy") && flow.stages.every((stage) => stage === "m.login.dummy" || challenge.completed.includes(stage)))) {
          return this.register(capabilities, username, password, { session: challenge.session, type: "m.login.dummy" });
        }
        if (failure.data.errcode) throw new Error(failure.data.error ?? "Registration verification failed. Try again.");
        return { challenge };
      }
      if (failure.data?.errcode === "M_FORBIDDEN") throw new Error(failure.data.error ?? "Registration is disabled on this homeserver.");
      throw error;
    }
  }

  async discover(serverNameOrUrl: string): Promise<MatrixAuthCapabilities> {
    normalizeDirectUrl(serverNameOrUrl.trim());
    const serverName = normalizeServerName(serverNameOrUrl);
    let discovered = await AutoDiscovery.findClientConfig(serverName);

    if (
      discovered["m.homeserver"].state !== AutoDiscoveryAction.SUCCESS ||
      !discovered["m.homeserver"].base_url
    ) {
      discovered = await AutoDiscovery.fromDiscoveryConfig({
        "m.homeserver": { base_url: normalizeDirectUrl(serverNameOrUrl) },
      });
    }

    const homeserver = discovered["m.homeserver"];
    if (homeserver.state !== AutoDiscoveryAction.SUCCESS || !homeserver.base_url) {
      throw new Error(
        homeserver.error instanceof Error
          ? homeserver.error.message
          : (homeserver.error ?? "Could not discover a compatible Matrix homeserver."),
      );
    }

    const baseUrl = secureHomeserverUrl(homeserver.base_url);
    const client = createClient({ baseUrl });
    const response = await client.loginFlows();
    const ssoFlow = response.flows.find(
      (flow) => flow.type === "m.login.sso" || flow.type === "m.login.cas",
    );
    let delegatedOAuth = false;
    try {
      await client.getAuthMetadata();
      delegatedOAuth = true;
    } catch {
      // Auth metadata is optional. Traditional SSO and password remain valid.
    }

    const identityProviders =
      ssoFlow && "identity_providers" in ssoFlow
        ? (ssoFlow.identity_providers ?? []).map((provider) => ({
            id: provider.id,
            name: provider.name,
            iconUrl: provider.icon
              ? getHttpUriForMxc(client.getHomeserverUrl(), provider.icon, undefined, undefined, undefined, true, true, true) || provider.icon
              : null,
            brand: provider.brand ?? null,
          }))
        : [];

    return {
      serverName,
      homeserverUrl: baseUrl,
      password: response.flows.some((flow) => flow.type === "m.login.password"),
      browser: Boolean(ssoFlow),
      delegatedOAuth,
      identityProviders,
    };
  }

  async loginWithPassword(
    capabilities: MatrixAuthCapabilities,
    user: string,
    password: string,
  ): Promise<MatrixSession> {
    if (!capabilities.password) {
      throw new Error("This homeserver does not advertise password login.");
    }
    const client = createClient({ baseUrl: secureHomeserverUrl(capabilities.homeserverUrl) });
    const login = await client.loginRequest({
      type: "m.login.password",
      identifier: { type: "m.id.user", user: user.trim() },
      password,
      initial_device_display_name: DEVICE_NAME,
      refresh_token: true,
    });
    return sessionFromLogin(login, capabilities);
  }

  async startBrowserLogin(
    capabilities: MatrixAuthCapabilities,
    request: BrowserLoginRequest = {},
  ): Promise<void> {
    if (!capabilities.browser) {
      throw new Error("This homeserver does not advertise a browser login flow.");
    }
    if (!window.desktop) {
      throw new Error("Browser login requires the Electron desktop application.");
    }

    const client = createClient({ baseUrl: secureHomeserverUrl(capabilities.homeserverUrl) });
    const state = crypto.randomUUID();
    const callback = new URL(CALLBACK_URL);
    callback.searchParams.set("state", state);
    const url = client.getSsoLoginUrl(
      callback.href,
      "sso",
      request.identityProviderId,
      request.register ? SSOAction.REGISTER : SSOAction.LOGIN,
    );
    const pending = { capabilities, state, expiresAt: Date.now() + 10 * 60_000 };
    this.pendingBrowserLogin = pending;
    try { await window.desktop.auth.openExternal(url); }
    catch (error) { if (this.pendingBrowserLogin === pending) this.pendingBrowserLogin = null; throw error; }
  }

  async completeBrowserLogin(callbackUrl: string): Promise<MatrixSession> {
    const pending = this.pendingBrowserLogin;
    if (!pending) throw new Error("No browser login is currently in progress.");
    if (!this.matchesBrowserCallback(callbackUrl)) throw new Error("The sign-in callback is invalid, expired, or belongs to a different login attempt.");
    // Consume the attempt before exchanging its one-time token.
    this.pendingBrowserLogin = null;

    const parsed = new URL(callbackUrl);
    if (parsed.protocol !== "grungus-matrix:" || parsed.hostname !== "auth") {
      throw new Error("Received an invalid authentication callback.");
    }
    const fragment = new URLSearchParams(parsed.hash.replace(/^#/, ""));
    const loginToken =
      parsed.searchParams.get("loginToken") ??
      parsed.searchParams.get("login_token") ??
      fragment.get("loginToken") ??
      fragment.get("login_token");
    const authError = parsed.searchParams.get("error") ?? fragment.get("error");
    if (authError) {
      throw new Error(
        parsed.searchParams.get("error_description") ??
          fragment.get("error_description") ??
          authError,
      );
    }
    if (!loginToken) throw new Error("The login callback did not contain a token.");

    const client = createClient({
      baseUrl: pending.capabilities.homeserverUrl,
    });
    const login = await client.loginRequest({
      type: "m.login.token",
      token: loginToken,
      initial_device_display_name: DEVICE_NAME,
      refresh_token: true,
    });
    this.pendingBrowserLogin = null;
    return sessionFromLogin(login, pending.capabilities);
  }

  restoreSession(): Promise<MatrixSession | null> {
    return window.desktop?.session.load() ?? Promise.resolve(null);
  }

  async persistSession(session: MatrixSession): Promise<string | null> {
    if (!window.desktop) return "Session persistence is available in Electron only.";
    const result = await window.desktop.session.save(session);
    return result.persisted ? null : (result.reason ?? "Session was not persisted.");
  }

  clearSession(): Promise<void> {
    this.pendingBrowserLogin = null;
    return window.desktop?.session.remove() ?? Promise.resolve();
  }

  subscribeToBrowserCallback(listener: (url: string) => void): () => void {
    return window.desktop?.auth.onCallback(url => { if (this.matchesBrowserCallback(url)) listener(url); }) ?? (() => undefined);
  }
  private matchesBrowserCallback(value: string): boolean {
    try {
      const url = new URL(value);
      const pending = this.pendingBrowserLogin;
      return !!pending && Date.now() <= pending.expiresAt && url.protocol === "grungus-matrix:" && url.hostname === "auth" && url.pathname === "/callback" && !url.username && !url.password && url.searchParams.getAll("state").length === 1 && url.searchParams.get("state") === pending.state;
    } catch { return false; }
  }
}

