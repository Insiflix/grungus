import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AutoDiscovery, AutoDiscoveryAction, createClient, SSOAction, type MatrixClient } from "matrix-js-sdk";
import { OAuth2, type ValidatedAuthMetadata } from "matrix-js-sdk/lib/oauth/index.js";
import { MatrixAuthProvider } from "./MatrixAuthProvider";
import type { MatrixAuthCapabilities } from "../../domain/matrix/MatrixTypes";

vi.mock("matrix-js-sdk", async original => ({
  ...await original<typeof import("matrix-js-sdk")>(), createClient: vi.fn(),
}));
const metadata: ValidatedAuthMetadata = {
  issuer: "https://matrix.example.org/",
  authorization_endpoint: "https://matrix.example.org/oauth/authorize",
  token_endpoint: "https://matrix.example.org/oauth/token",
  registration_endpoint: "https://matrix.example.org/oauth/register",
  revocation_endpoint: "https://matrix.example.org/oauth/revoke",
  response_modes_supported: ["query", "fragment"], response_types_supported: ["code"],
  code_challenge_methods_supported: ["S256"], grant_types_supported: ["authorization_code", "refresh_token"],
};
const callback = "http://127.0.0.1:12345/matrix-sso/callback?state=test-state";
const capabilities: MatrixAuthCapabilities = {
  homeserverUrl: "https://matrix.example.org", serverName: "example.org",
  password: true, browser: true, delegatedOAuth: false,
  identityProviders: [{ id: "server-provider", name: "Organisation", iconUrl: null, brand: null }],
};
const login = { access_token: "access", refresh_token: "refresh", user_id: "@me:example.org", device_id: "DEVICE" };
const sdk = {
  loginFlows: vi.fn(), loginRequest: vi.fn(), getAuthMetadata: vi.fn(), whoami: vi.fn(),
  getHomeserverUrl: () => capabilities.homeserverUrl,
  getSsoLoginUrl: vi.fn(() => "https://matrix.example.org/_matrix/client/v3/login/sso/redirect"),
};
const auth = { prepareSso: vi.fn(async () => callback), cancelSso: vi.fn(), openExternal: vi.fn() };
beforeEach(() => {
  vi.clearAllMocks();
  sdk.loginRequest.mockResolvedValue(login);
  sdk.getAuthMetadata.mockResolvedValue(metadata);
  vi.mocked(createClient).mockReturnValue(sdk as unknown as MatrixClient);
  vi.stubGlobal("window", { desktop: { auth } });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("Matrix SSO", () => {
  it("discovers OAuth-only homeservers despite the disabled legacy login API", async () => {
    vi.spyOn(AutoDiscovery, "findClientConfig").mockResolvedValue({
      "m.homeserver": { state: AutoDiscoveryAction.SUCCESS, base_url: capabilities.homeserverUrl },
    } as never);
    sdk.loginFlows.mockRejectedValueOnce({ httpStatus: 404, errcode: "M_UNRECOGNIZED" });
    sdk.getAuthMetadata.mockResolvedValueOnce(metadata);
    await expect(new MatrixAuthProvider().discover("example.org")).resolves.toMatchObject({ browser: true, delegatedOAuth: true, password: false });
    expect(sdk.getSsoLoginUrl).not.toHaveBeenCalled();
  });

  it("preserves the original error when no OAuth metadata is available", async () => {
    vi.spyOn(AutoDiscovery, "findClientConfig").mockResolvedValue({
      "m.homeserver": { state: AutoDiscoveryAction.SUCCESS, base_url: capabilities.homeserverUrl },
    } as never);
    const error = { httpStatus: 404, errcode: "M_UNRECOGNIZED" };
    sdk.loginFlows.mockRejectedValueOnce(error);
    sdk.getAuthMetadata.mockRejectedValueOnce(new Error("Unavailable"));
    await expect(new MatrixAuthProvider().discover("example.org")).rejects.toBe(error);
  });

  it.each([true, false])("discovers advertised providers and password support: %s", async password => {
    vi.spyOn(AutoDiscovery, "findClientConfig").mockResolvedValue({
      "m.homeserver": { state: AutoDiscoveryAction.SUCCESS, base_url: capabilities.homeserverUrl },
    } as never);
    sdk.loginFlows.mockResolvedValue({ flows: [
      { type: "m.login.sso", identity_providers: [{ id: "advertised-id", name: "Company sign-in" }] },
      ...(password ? [{ type: "m.login.password" }] : []),
    ] });
    const discovered = await new MatrixAuthProvider().discover("example.org");
    expect(discovered).toMatchObject({ browser: true, password, homeserverUrl: capabilities.homeserverUrl,
      identityProviders: [{ id: "advertised-id", name: "Company sign-in" }] });
    expect(sdk.loginFlows).toHaveBeenCalledOnce();
  });

  it("uses the single advertised provider, exchanges the token and retains refresh credentials", async () => {
    const provider = new MatrixAuthProvider();
    await provider.startBrowserLogin(capabilities);
    expect(sdk.getSsoLoginUrl).toHaveBeenCalledWith(callback, "sso", "server-provider", SSOAction.LOGIN);
    const session = await provider.completeBrowserLogin(callback + "&loginToken=one-time");
    expect(sdk.loginRequest).toHaveBeenCalledWith({ type: "m.login.token", token: "one-time",
      initial_device_display_name: "Grungus Matrix Desktop", refresh_token: true });
    expect(session).toMatchObject({ homeserverUrl: capabilities.homeserverUrl, accessToken: "access",
      refreshToken: "refresh", userId: login.user_id, deviceId: login.device_id });
    expect(auth.cancelSso).toHaveBeenCalledOnce();
  });

  it("uses the selected provider or the generic endpoint when no providers are advertised", async () => {
    const provider = new MatrixAuthProvider();
    await provider.startBrowserLogin({ ...capabilities, identityProviders: [
      ...capabilities.identityProviders, { id: "second", name: "Second provider", iconUrl: null, brand: null },
    ] }, { identityProviderId: "second" });
    expect(sdk.getSsoLoginUrl).toHaveBeenLastCalledWith(callback, "sso", "second", SSOAction.LOGIN);
    await provider.startBrowserLogin({ ...capabilities, identityProviders: [] });
    expect(sdk.getSsoLoginUrl).toHaveBeenLastCalledWith(callback, "sso", undefined, SSOAction.LOGIN);
    await expect(provider.startBrowserLogin(capabilities, { identityProviderId: "forged" })).rejects.toThrow("Unknown");
  });

  it.each(["Invalid or expired login token", "Network error"])("consumes failed exchanges and permits retry: %s", async message => {
    const provider = new MatrixAuthProvider();
    sdk.loginRequest.mockRejectedValueOnce(new Error(message));
    await provider.startBrowserLogin(capabilities);
    await expect(provider.completeBrowserLogin(callback + "&loginToken=bad")).rejects.toThrow(message);
    await expect(provider.completeBrowserLogin(callback + "&loginToken=bad")).rejects.toThrow("No browser login");
    await provider.startBrowserLogin(capabilities);
    await expect(provider.completeBrowserLogin(callback + "&loginToken=new")).resolves.toHaveProperty("accessToken", "access");
  });

  it("closes the listener if launching the system browser fails", async () => {
    const provider = new MatrixAuthProvider();
    auth.openExternal.mockRejectedValueOnce(new Error("Cannot open browser"));
    await expect(provider.startBrowserLogin(capabilities)).rejects.toThrow("Cannot open browser");
    expect(auth.cancelSso).toHaveBeenCalledOnce();
    await expect(provider.completeBrowserLogin(callback + "&loginToken=late")).rejects.toThrow("No browser login");
  });

  it("rejects an exchange finishing after the user cancels", async () => {
    const provider = new MatrixAuthProvider();
    let finish!: (value: typeof login) => void;
    sdk.loginRequest.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await provider.startBrowserLogin(capabilities);
    const completing = provider.completeBrowserLogin(callback + "&loginToken=late");
    await vi.waitFor(() => expect(sdk.loginRequest).toHaveBeenCalled());
    await provider.cancelBrowserLogin();
    finish(login);
    await expect(completing).rejects.toThrow("cancelled");
  });
});

describe("native Matrix OAuth", () => {
  const oauthCapabilities = { ...capabilities, delegatedOAuth: true, password: false, identityProviders: [] };

  async function start() {
    const provider = new MatrixAuthProvider();
    vi.spyOn(OAuth2, "registerClient").mockResolvedValue("public-client");
    await provider.startBrowserLogin(oauthCapabilities);
    const authorization = new URL(auth.openExternal.mock.calls[0][0] as string);
    const scope = authorization.searchParams.get("scope")!;
    const device = scope.split(" ").find(scope => scope.startsWith("urn:matrix:client:device:"))!.split(":").at(-1)!;
    sdk.whoami.mockResolvedValue({ user_id: login.user_id, device_id: device });
    return { provider, authorization, device };
  }

  it("uses SDK PKCE and public native registration, then resolves the Matrix identity", async () => {
    const { provider, authorization, device } = await start();
    expect(auth.prepareSso).toHaveBeenCalledWith("oauth");
    expect(OAuth2.registerClient).toHaveBeenCalledWith(metadata, expect.objectContaining({
      application_type: "native", token_endpoint_auth_method: "none",
      redirect_uris: ["http://127.0.0.1/matrix-sso/callback"],
    }));
    expect(authorization.searchParams.get("state")).toBe("test-state");
    expect(authorization.searchParams.get("code_challenge_method")).toBe("S256");
    expect(authorization.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(authorization.searchParams.get("response_mode")).toBe("query");
    const fetchMock = vi.fn(async () => Response.json({ ...login, token_type: "Bearer" }));
    vi.stubGlobal("fetch", fetchMock);
    const session = await provider.completeBrowserLogin(callback + "&code=authorization-code&iss=" + encodeURIComponent(metadata.issuer));
    const [endpoint, options] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(endpoint).toBe(metadata.token_endpoint);
    const body = options.body as URLSearchParams;
    expect(body.get("client_id")).toBe("public-client");
    expect(body.get("code")).toBe("authorization-code");
    expect(body.has("client_secret")).toBe(false);
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body.get("code_verifier")!));
    expect(Buffer.from(digest).toString("base64url")).toBe(authorization.searchParams.get("code_challenge"));
    expect(session).toMatchObject({ accessToken: "access", refreshToken: "refresh", userId: login.user_id,
      deviceId: device, oauth: { issuer: metadata.issuer, clientId: "public-client" } });
    expect(sdk.loginRequest).not.toHaveBeenCalled();
    await expect(provider.completeBrowserLogin(callback + "&code=replayed")).rejects.toThrow("No browser login");
  });

  it.each(["&code=a&code=b", "&code=a&iss=https%3A%2F%2Fevil.example", "&error=access_denied"])("rejects invalid or denied responses: %s", async query => {
    const { provider } = await start();
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    await expect(provider.completeBrowserLogin(callback + query)).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("cancels in-flight registration without launching a browser later", async () => {
    let finish!: (id: string) => void;
    vi.spyOn(OAuth2, "registerClient").mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const provider = new MatrixAuthProvider();
    const starting = provider.startBrowserLogin(oauthCapabilities);
    await vi.waitFor(() => expect(OAuth2.registerClient).toHaveBeenCalled());
    await provider.cancelBrowserLogin();
    finish("late-client"); await starting;
    expect(auth.openExternal).not.toHaveBeenCalled();
  });

  it("closes its callback listener when registration fails", async () => {
    vi.spyOn(OAuth2, "registerClient").mockRejectedValue(new Error("Registration failed"));
    await expect(new MatrixAuthProvider().startBrowserLogin(oauthCapabilities)).rejects.toThrow("Registration failed");
    expect(auth.cancelSso).toHaveBeenCalled();
    expect(auth.openExternal).not.toHaveBeenCalled();
  });
});
