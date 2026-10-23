import { useState, type FormEvent } from "react";
import { ShieldCheck as ShieldIcon } from "lucide-react";
import { useMatrixSession } from "../../hooks/matrix/useMatrixSession";
import { RegistrationForm } from "./RegistrationForm";
import { BrandLogo } from "../../components/common/BrandLogo";

export function LoginScreen() {
  const {
    phase,
    discovery,
    discoveryPending,
    browserLoginPending,
    error,
    discover,
    resetDiscovery,
    loginWithPassword,
    startBrowserLogin,
    cancelRegistration,
    cancelBrowserLogin,
  } = useMatrixSession();
  const [server, setServer] = useState("matrix.grung.us");
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [registering, setRegistering] = useState(false);
  const startSso = (id?: string) => { void startBrowserLogin(id, registering); };
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
          <BrandLogo className="brand-mark" />
          <div>
            <strong>GRUNGUS</strong>
            <span>MATRIX DESKTOP</span>
          </div>
        </div>

        {!discovery ? (
          <>
            <div className="login-copy">
              <h1 id="login-title">Welcome to Grungus</h1>
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
                  placeholder="matrix.grung.us"
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
              <h1 id="login-title">{registering ? "Create an account" : "Sign in"}</h1>
              <p className="server-chip">
                <span className="server-chip__dot" /> {discovery.homeserverUrl}
              </p>
            </div>

            <div className="auth-mode" aria-label="Account access">
              <button type="button" aria-pressed={!registering} disabled={busy} onClick={() => { setRegistering(false); cancelRegistration(); }}>Sign in</button>
              <button type="button" aria-pressed={registering} disabled={busy} onClick={() => { setRegistering(true); cancelRegistration(); setPassword(""); }}>Register</button>
            </div>

            {discovery.browser && (
              <div className="browser-auth">
                <button
                  className="button button--primary"
                  type="button"
                  disabled={busy}
                  onClick={() => startSso()}
                >
                  {phase === "authenticating"
                    ? "Waiting for browser…"
                    : registering ? "Register in browser" : discovery.delegatedOAuth
                      ? "Continue securely in browser"
                      : `Mit SSO anmelden${discovery.identityProviders.length === 1 ? ` (${discovery.identityProviders[0].name})` : ""}`}
                </button>
                {browserLoginPending && <p role="status">Anmeldung im Systembrowser. <button type="button" className="back-button" onClick={() => { void cancelBrowserLogin(); }}>Anmeldung abbrechen</button></p>}
                {discovery.identityProviders.length > 1 && (
                  <div className="identity-providers">
                    {discovery.identityProviders.map((provider) => (
                      <button
                        type="button"
                        className="button button--secondary"
                        key={provider.id}
                        onClick={() => startSso(provider.id)}
                        disabled={busy}
                      >
                        {provider.iconUrl && <img src={provider.iconUrl} alt="" referrerPolicy="no-referrer" />}
                        {provider.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {discovery.browser && (discovery.password || (registering && !discovery.delegatedOAuth)) && <div className="divider"><span>or</span></div>}

            {registering && !discovery.delegatedOAuth && <RegistrationForm />}

            {discovery.password && !registering && (
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

            {!registering && !discovery.browser && !discovery.password && (
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


