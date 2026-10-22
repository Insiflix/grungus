import { afterEach, describe, expect, it, vi } from "vitest";
import { createClient, type MatrixClient } from "matrix-js-sdk";
import type { ValidatedAuthMetadata } from "matrix-js-sdk/lib/oauth/index.js";
import { oauthForSession, validateOAuthMetadata } from "./MatrixOAuth";

vi.mock("matrix-js-sdk", async original => ({ ...await original<typeof import("matrix-js-sdk")>(), createClient: vi.fn() }));
const metadata: ValidatedAuthMetadata = {
  issuer: "https://auth.example.org/", authorization_endpoint: "https://auth.example.org/authorize",
  token_endpoint: "https://auth.example.org/token", revocation_endpoint: "https://auth.example.org/revoke",
  registration_endpoint: "https://auth.example.org/register", response_modes_supported: ["query", "fragment"],
  response_types_supported: ["code"], code_challenge_methods_supported: ["S256"],
  grant_types_supported: ["authorization_code", "refresh_token"],
};
const session = { homeserverUrl: "https://matrix.example.org", serverName: "example.org", userId: "@me:example.org", deviceId: "DEVICE", accessToken: "access", refreshToken: "refresh", oauth: { issuer: metadata.issuer, clientId: "public-client" } };
afterEach(() => vi.restoreAllMocks());

describe("OAuth session restoration", () => {
  it("rediscovers metadata and retains the saved client and device identity", async () => {
    const getAuthMetadata = vi.fn(async () => metadata);
    vi.mocked(createClient).mockReturnValue({ getAuthMetadata } as unknown as MatrixClient);
    const oauth = await oauthForSession(session);
    expect(getAuthMetadata).toHaveBeenCalledOnce();
    expect(oauth?.context).toMatchObject({ clientId: "public-client", deviceId: "DEVICE" });
    expect(oauth?.metadata.issuer).toBe(session.oauth.issuer);
  });

  it("rejects a changed issuer before sending any refresh credential", async () => {
    vi.mocked(createClient).mockReturnValue({ getAuthMetadata: vi.fn(async () => ({ ...metadata, issuer: "https://other.example.org/" })) } as unknown as MatrixClient);
    await expect(oauthForSession(session)).rejects.toThrow("issuer changed");
  });

  it.each(["token_endpoint", "authorization_endpoint", "registration_endpoint", "revocation_endpoint"] as const)("rejects insecure %s", endpoint => {
    expect(() => validateOAuthMetadata({ ...metadata, [endpoint]: "http://attacker.example.org" })).toThrow();
  });

  it("requires PKCE S256 support", () => {
    expect(() => validateOAuthMetadata({ ...metadata, code_challenge_methods_supported: ["plain"] })).toThrow();
  });
});
