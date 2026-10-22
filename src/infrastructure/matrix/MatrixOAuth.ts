import { createClient } from "matrix-js-sdk";
import { OAuth2, isValidAuthMetadata, type ValidatedAuthMetadata } from "matrix-js-sdk/lib/oauth/index.js";
import type { MatrixSession } from "../../domain/matrix/MatrixTypes";
import { secureExternalUrl, secureHomeserverUrl } from "../../../electron/shared/urls";

export function validateOAuthMetadata(metadata: ValidatedAuthMetadata): ValidatedAuthMetadata {
  if (!isValidAuthMetadata(metadata)) throw new Error("The homeserver returned invalid Matrix OAuth metadata.");
  for (const endpoint of [metadata.issuer, metadata.authorization_endpoint, metadata.token_endpoint, metadata.registration_endpoint, metadata.revocation_endpoint]) {
    secureExternalUrl(endpoint);
  }
  const issuer = new URL(metadata.issuer);
  if (issuer.search || issuer.hash) throw new Error("Invalid Matrix OAuth issuer.");
  return metadata;
}

/** The SDK helpers do not expose AbortSignal; bound how long the UI waits. */
export async function withAuthTimeout<T>(request: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([request, new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error("Authentication request timed out. Please try again.")), 30_000);
    })]);
  } finally { clearTimeout(timer); }
}

export async function oauthForSession(session: MatrixSession): Promise<OAuth2 | null> {
  if (!session.oauth) return null;
  const client = createClient({ baseUrl: secureHomeserverUrl(session.homeserverUrl) });
  const metadata = validateOAuthMetadata(await withAuthTimeout(client.getAuthMetadata()));
  if (metadata.issuer !== session.oauth.issuer) throw new Error("The homeserver's OAuth issuer changed. Sign in again.");
  return new OAuth2(metadata, { clientId: session.oauth.clientId, deviceId: session.deviceId, redirectUri: "" });
}
