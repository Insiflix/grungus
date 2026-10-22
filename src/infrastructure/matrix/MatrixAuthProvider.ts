import { OAuth2 } from "matrix-js-sdk/lib/oauth/index.js";
import { validateOAuthMetadata, withAuthTimeout } from "./MatrixOAuth";
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

const DEVICE_NAME = "Grungus Matrix Desktop";
import { secureHomeserverUrl } from "../../../electron/shared/urls";

interface PendingBrowserLogin {
  capabilities: MatrixAuthCapabilities;
  callbackUrl: string;
  oauth?: OAuth2;
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
  if (!login.access_token || !login.device_id || !login.user_id) {
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
  private browserGeneration = 0;

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
    let delegatedOAuth = false;
    const response = await client.loginFlows().catch(async (error: unknown): Promise<Awaited<ReturnType<typeof client.loginFlows>>> => {
      const failure = error as { httpStatus?: number; errcode?: string };
      if (failure.httpStatus === 404 || failure.errcode === "M_UNRECOGNIZED") {
        // OAuth-only homeservers may deliberately disable the legacy login API.
        // Do not invent an SSO endpoint when no m.login.sso flow is advertised.
        const metadata = await client.getAuthMetadata().catch(() => null);
        if (metadata) {
          validateOAuthMetadata(metadata);
          delegatedOAuth = true;
          return { flows: [] };
        }
      }
      throw error;
    });
    const ssoFlow = response.flows.find(
      (flow) => flow.type === "m.login.sso",
    );

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
      browser: Boolean(ssoFlow) || delegatedOAuth,
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

    if (request.identityProviderId && !capabilities.identityProviders.some(provider => provider.id === request.identityProviderId)) {
      throw new Error("Unknown SSO identity provider.");
    }
    const generation = ++this.browserGeneration;
    const client = createClient({ baseUrl: secureHomeserverUrl(capabilities.homeserverUrl) });
    const callbackUrl = await window.desktop.auth.prepareSso(capabilities.delegatedOAuth ? "oauth" : "sso");
    if (generation !== this.browserGeneration) return;
    const pending: PendingBrowserLogin = { capabilities: { ...capabilities }, callbackUrl, expiresAt: Date.now() + 10 * 60_000 };
    this.pendingBrowserLogin = pending;
    try {
      let url: string;
      if (capabilities.delegatedOAuth) {
        const metadata = validateOAuthMetadata(await withAuthTimeout(client.getAuthMetadata()));
        if (generation !== this.browserGeneration || this.pendingBrowserLogin !== pending) return;
        const redirect = new URL(callbackUrl);
        const state = redirect.searchParams.get("state")!;
        redirect.search = ""; // OAuth returns state separately, exactly once.
        const registeredRedirect = new URL(redirect);
        registeredRedirect.port = ""; // Native loopback registrations accept any runtime port.
        const clientId = await withAuthTimeout(OAuth2.registerClient(metadata, {
          application_type: "native", client_name: DEVICE_NAME,
          client_uri: "https://grung.us/", redirect_uris: [registeredRedirect.href],
          grant_types: ["authorization_code", "refresh_token"],
          response_types: ["code"], token_endpoint_auth_method: "none",
        }));
        if (generation !== this.browserGeneration || this.pendingBrowserLogin !== pending) return;
        pending.oauth = new OAuth2(metadata, { clientId, redirectUri: redirect.href });
        url = await pending.oauth.generateAuthorizationCodeGrantUrl(state, "query",
          request.register && metadata.prompt_values_supported?.includes("create") ? "create" : undefined);
      } else {
        url = client.getSsoLoginUrl(
          callbackUrl, "sso", request.identityProviderId ?? (capabilities.identityProviders.length === 1 ? capabilities.identityProviders[0].id : undefined),
          request.register ? SSOAction.REGISTER : SSOAction.LOGIN,
        );
      }
      if (generation !== this.browserGeneration || this.pendingBrowserLogin !== pending) return;
      await window.desktop.auth.openExternal(url);
    } catch (error) {
      if (this.pendingBrowserLogin === pending) await this.cancelBrowserLogin();
      throw error;
    }
  }

  async cancelBrowserLogin(): Promise<void> {
    this.browserGeneration++;
    this.pendingBrowserLogin = null;
    await window.desktop?.auth.cancelSso();
  }

  async completeBrowserLogin(callbackUrl: string): Promise<MatrixSession> {
    const pending = this.pendingBrowserLogin;
    if (!pending) throw new Error("No browser login is currently in progress.");
    if (!this.matchesBrowserCallback(callbackUrl)) throw new Error("The sign-in callback is invalid, expired, or belongs to a different login attempt.");
    // Consume the attempt before exchanging its one-time token.
    this.pendingBrowserLogin = null;

    const generation = this.browserGeneration;
    const parsed = new URL(callbackUrl);
    await window.desktop?.auth.cancelSso();
    if (generation !== this.browserGeneration) throw new Error("Browser login cancelled.");
    const authError = parsed.searchParams.get("error");
    if (authError) throw new Error(authError);
    if (pending.capabilities.delegatedOAuth) {
      const oauth = pending.oauth;
      const codes = parsed.searchParams.getAll("code");
      const issuers = parsed.searchParams.getAll("iss");
      if (!oauth || codes.length !== 1 || !codes[0] || issuers.length > 1 || (issuers.length === 1 && issuers[0] !== oauth.metadata.issuer)) {
        throw new Error("Received an invalid OAuth callback.");
      }
      const tokens = await withAuthTimeout(oauth.completeAuthorizationCodeGrant(codes[0]));
      if (generation !== this.browserGeneration) throw new Error("Browser login cancelled.");
      const authenticated = createClient({ baseUrl: pending.capabilities.homeserverUrl, accessToken: tokens.access_token });
      const identity = await withAuthTimeout(authenticated.whoami());
      if (generation !== this.browserGeneration) throw new Error("Browser login cancelled.");
      if (!identity.user_id || !identity.device_id || identity.device_id !== oauth.context.deviceId) {
        throw new Error("The homeserver returned an invalid OAuth device session.");
      }
      return {
        ...sessionFromLogin({ ...tokens, user_id: identity.user_id, device_id: identity.device_id }, pending.capabilities),
        oauth: { issuer: oauth.metadata.issuer, clientId: oauth.context.clientId },
      };
    }
    const tokens = parsed.searchParams.getAll("loginToken");
    if (tokens.length !== 1 || !tokens[0]) throw new Error("The login callback did not contain a valid token.");
    const loginToken = tokens[0];
    if (generation !== this.browserGeneration) throw new Error("Browser login cancelled.");

    const client = createClient({
      baseUrl: pending.capabilities.homeserverUrl,
    });
    const login = await client.loginRequest({
      type: "m.login.token",
      token: loginToken,
      initial_device_display_name: DEVICE_NAME,
      refresh_token: true,
    });
    if (generation !== this.browserGeneration) throw new Error("Browser login cancelled.");
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
    return this.cancelBrowserLogin().then(() => window.desktop?.session.remove());
  }

  subscribeToBrowserCallback(listener: (url: string) => void): () => void {
    return window.desktop?.auth.onCallback(url => { if (this.matchesBrowserCallback(url)) listener(url); }) ?? (() => undefined);
  }
  private matchesBrowserCallback(value: string): boolean {
    try {
      const url = new URL(value);
      const pending = this.pendingBrowserLogin;
      if (!pending) return false;
      const expected = new URL(pending.callbackUrl);
      return (Date.now() <= pending.expiresAt || url.searchParams.has("error")) &&
        url.origin === expected.origin && url.pathname === expected.pathname &&
        !url.username && !url.password && !url.hash &&
        url.searchParams.getAll("state").length === 1 &&
        url.searchParams.get("state") === expected.searchParams.get("state");
    } catch { return false; }
  }
}

