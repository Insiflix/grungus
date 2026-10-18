import { useState, type FormEvent } from "react";
import { useMatrixSession } from "../../hooks/matrix/useMatrixSession";

const stageNames: Record<string, string> = {
  "m.login.recaptcha": "CAPTCHA", "m.login.terms": "Terms and privacy",
  "m.login.email.identity": "Email verification", "m.login.msisdn": "Phone verification",
  "m.login.registration_token": "Registration token", "m.login.dummy": "Finish registration",
};

export function RegistrationForm() {
  const { phase, discovery, registrationChallenge: challenge, register, cancelRegistration } = useMatrixSession();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [token, setToken] = useState("");
  const [flowIndex, setFlowIndex] = useState(0);
  const [localError, setLocalError] = useState<string | null>(null);
  const busy = phase === "authenticating";
  const flow = challenge?.flows[flowIndex] ?? challenge?.flows[0];
  const stage = flow?.stages.find((candidate) => !challenge?.completed.includes(candidate));
  const isToken = stage === "m.login.registration_token" || stage === "org.matrix.msc3231.login.registration_token";
  const isDummy = stage === "m.login.dummy";
  const fallbackUrl = discovery && challenge && stage
    ? `${discovery.homeserverUrl.replace(/\/$/, "")}/_matrix/client/v3/auth/${encodeURIComponent(stage)}/fallback/web?session=${encodeURIComponent(challenge.session)}` : null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setLocalError(null);
    if (password !== confirmation) { setLocalError("Passwords do not match."); return; }
    void register(username, password, challenge ? {
      session: challenge.session,
      ...(isToken ? { type: stage, token: token.trim() } : isDummy ? { type: stage } : {}),
    } : undefined);
  };

  const openVerification = async () => {
    if (!fallbackUrl) return;
    setLocalError(null);
    try {
      if (window.desktop) await window.desktop.auth.openExternal(fallbackUrl);
      else window.open(fallbackUrl, "_blank", "noopener,noreferrer");
    } catch (cause) { setLocalError(cause instanceof Error ? cause.message : "Could not open verification."); }
  };

  return <form className="auth-form registration-form" onSubmit={submit}>
    <p className="registration-note">Create an account on {discovery?.serverName}. Registration must be enabled by this homeserver.</p>
    <label htmlFor="register-user">Username</label>
    <input id="register-user" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" placeholder="you" required readOnly={Boolean(challenge)} disabled={busy} />
    <label htmlFor="register-password">Password</label>
    <input id="register-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" required readOnly={Boolean(challenge)} disabled={busy} />
    <label htmlFor="register-confirm">Confirm password</label>
    <input id="register-confirm" type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="new-password" required readOnly={Boolean(challenge)} disabled={busy} />
    {challenge && <section className="registration-verification" aria-label="Account verification">
      <strong>Verify your account</strong>
      {challenge.flows.length > 1 && <>
        <label htmlFor="registration-flow">Verification method</label>
        <select id="registration-flow" value={flowIndex} disabled={busy} onChange={(event) => { setFlowIndex(Number(event.target.value)); setToken(""); }}>
          {challenge.flows.map((candidate, index) => <option key={index} value={index}>{candidate.stages.map((item) => stageNames[item] ?? item).join(" + ")}</option>)}
        </select>
      </>}
      <ol>{flow?.stages.map((item) => <li key={item}>{stageNames[item] ?? item}{challenge.completed.includes(item) ? " — complete" : item === stage ? " — next" : ""}</li>)}</ol>
      {isToken && <><label htmlFor="register-token">Registration token</label><input id="register-token" value={token} onChange={(event) => setToken(event.target.value)} required disabled={busy} autoComplete="off" /></>}
      {stage && !isToken && !isDummy && <>
        <p>Complete {stageNames[stage] ?? "verification"} on your homeserver, then return here to continue.</p>
        <button type="button" className="button button--secondary" disabled={busy} onClick={() => void openVerification()}>Open verification in browser</button>
      </>}
    </section>}
    {localError && <p className="error-banner" role="alert">{localError}</p>}
    <button type="submit" className="button button--primary" disabled={busy || (isToken && !token.trim())}>{busy ? "Creating account…" : challenge ? "Continue registration" : "Create account"}</button>
    {challenge && <button type="button" className="back-button registration-reset" disabled={busy} onClick={() => { cancelRegistration(); setToken(""); setFlowIndex(0); }}>Start over</button>}
  </form>;
}
