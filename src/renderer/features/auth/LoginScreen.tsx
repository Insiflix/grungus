import { useState, type FormEvent } from "react";
import { ShieldCheck as ShieldIcon } from "lucide-react";
import { useMatrixSession } from "../../hooks/matrix/useMatrixSession";

export function LoginScreen() {
  const {
    phase,
    discovery,
    discoveryPending,
    error,
    discover,
    resetDiscovery,
    loginWithPassword,
    startBrowserLogin,
  } = useMatrixSession();
  const [server, setServer] = useState("matrix.org");
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const busy = discoveryPending || phase === "authenticating";

  const handleDiscovery = (event: FormEvent) => {
    event.preventDefault();
    void discover(server);
  };
  const handlePassword = (event: FormEvent) => {
    event.preventDefault();
    void loginWithPassword(user, password);
  };

  return (
    <main className="login-screen">
      <div className="login-ambient login-ambient--one" />
      <div className="login-ambient login-ambient--two" />
      <section className="login-panel" aria-labelledby="login-title">
        <div className="login-brand">
          <div className="brand-mark">G</div>
          <div>
            <strong>GRUNGUS</strong>
            <span>MATRIX DESKTOP</span>
          </div>
        </div>

        {!discovery ? (
          <>
            <div className="login-copy">
              <h1 id="login-title">Sign in</h1>
              <p>Enter your Matrix homeserver name or URL.</p>
            </div>
            <form className="auth-form" onSubmit={handleDiscovery}>
              <label htmlFor="homeserver">Homeserver</label>
              <div className="input-prefix">
                <span>https://</span>
                <input
                  id="homeserver"
                  value={server}
                  onChange={(event) => setServer(event.target.value)}
                  placeholder="matrix.org"
                  autoComplete="url"
                  spellCheck={false}
                  disabled={busy}
                />
              </div>
              <button className="button button--primary" disabled={busy} type="submit">
                {discoveryPending ? "Discovering server…" : "Continue"}
              </button>
            </form>
          </>
        ) : (
          <>
            <button className="back-button" type="button" onClick={resetDiscovery} disabled={busy}>
              ← Change homeserver
            </button>
            <div className="login-copy login-copy--compact">
              <span className="eyebrow">Homeserver</span>
              <h1 id="login-title">Authentication</h1>
              <p className="server-chip">
                <span className="server-chip__dot" /> {discovery.homeserverUrl}
              </p>
            </div>

            {discovery.browser && (
              <div className="browser-auth">
                <button
                  className="button button--primary"
                  type="button"
                  disabled={busy}
                  onClick={() => void startBrowserLogin()}
                >
                  {phase === "authenticating"
                    ? "Waiting for browser…"
                    : discovery.delegatedOAuth
                      ? "Continue securely in browser"
                      : "Continue with SSO"}
                </button>
                {discovery.identityProviders.length > 0 && (
                  <div className="identity-providers">
                    {discovery.identityProviders.map((provider) => (
                      <button
                        type="button"
                        className="button button--secondary"
                        key={provider.id}
                        onClick={() => void startBrowserLogin(provider.id)}
                        disabled={busy}
                      >
                        {provider.iconUrl && <img src={provider.iconUrl} alt="" />}
                        {provider.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {discovery.browser && discovery.password && <div className="divider"><span>or</span></div>}

            {discovery.password && (
              <form className="auth-form" onSubmit={handlePassword}>
                <label htmlFor="matrix-user">Matrix ID or username</label>
                <input
                  id="matrix-user"
                  value={user}
                  onChange={(event) => setUser(event.target.value)}
                  placeholder="@you:example.org"
                  autoComplete="username"
                  disabled={busy}
                  required
                />
                <label htmlFor="matrix-password">Password</label>
                <input
                  id="matrix-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Your password"
                  autoComplete="current-password"
                  disabled={busy}
                  required
                />
                <button className="button button--secondary" disabled={busy} type="submit">
                  Sign in with password
                </button>
              </form>
            )}

            {!discovery.browser && !discovery.password && (
              <p className="error-banner">This server did not advertise a supported login flow.</p>
            )}
          </>
        )}

        {error && <p className="error-banner" role="alert">{error}</p>}
        <footer className="security-note">
          <ShieldIcon />
          <span>Credentials are encrypted by your operating system when stored.</span>
        </footer>
      </section>
    </main>
  );
}


