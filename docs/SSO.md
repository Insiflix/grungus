# Matrix SSO

Login methods and identity providers come from the configured homeserver via matrix-js-sdk 42.3.0 (`loginFlows`, `getSsoLoginUrl`, `loginRequest`). No direct OIDC client or Keycloak configuration is involved.

Electron main binds a temporary HTTP listener to 127.0.0.1 on an OS-assigned port. A cryptographically random, single-use state is carried in the redirect URL and checked by main and renderer. Only the trusted app main frame can create or cancel the listener. The system browser visits the homeserver SSO endpoint. The received loginToken is exchanged at the original homeserver using m.login.token, requesting refresh tokens.

Password and SSO use the same session conversion, runtime connection, Rust E2EE initialization and OS-encrypted session storage. Existing token refresh and Matrix logout remain in use. Listeners close on completion, cancellation, ten-minute timeout, renderer navigation/crash, window close and application exit. Closing the browser alone cannot be detected: use the cancel button or wait for timeout.

Manual integration check with a configured Synapse: discover the homeserver, choose an advertised provider, complete browser authentication, check sync and encrypted messages, restart to restore the session, then log out. Also check browser cancellation, retry after timeout, and password login on a server advertising m.login.password. No live account credentials are needed by automated tests.

## Native Matrix OAuth

OAuth-only homeservers (including matrix.grung.us / Continuwuity) return 404 M_UNRECOGNIZED for the legacy login API. Discovery then uses the SDK's validated Matrix auth_metadata endpoint. The client dynamically registers a public native application and uses the SDK OAuth2 authorization-code flow with S256 PKCE, query response mode and the same one-use loopback listener. Registration uses a portless loopback redirect; authorization and token exchange include the actual runtime port. No client secret or direct Keycloak API is used.

After exchanging the authorization code, Matrix whoami supplies the user ID and confirms the requested device ID. The public client ID and pinned issuer are stored alongside the session using OS encryption. On restore, metadata is rediscovered from the homeserver and its issuer checked. OAuth sessions refresh and revoke tokens at the advertised OAuth endpoints; traditional sessions retain Matrix refresh/logout. Both initialize the same Matrix client and Rust E2EE integration. PKCE verifiers and authorization codes are never persisted.

Live connectivity check: the configured server accepted public native registration and redirected the SDK-generated authorization request to its login page. Completing user authentication, session restore, encrypted messaging and logout still require a manual integration check with a real account.
