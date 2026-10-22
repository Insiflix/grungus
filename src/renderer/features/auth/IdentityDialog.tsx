import { useEffect, useRef, useState, type FormEvent } from "react";
import { ShieldCheck, X } from "lucide-react";
import { useMatrixRuntime } from "../../app/providers/MatrixProvider";
import { useMatrixSnapshot } from "../../hooks/matrix/useMatrixSnapshot";

export function IdentityDialog({ onClose, userVerification = false }: { onClose: () => void; userVerification?: boolean }) {
  const runtime = useMatrixRuntime();
  const { identity, session } = useMatrixSnapshot();
  const dialog = useRef<HTMLDialogElement>(null);
  const [key, setKey] = useState("");
  const [password, setPassword] = useState("");
  const [saved, setSaved] = useState(false);
  const [understood, setUnderstood] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = Boolean(identity?.busy || working);
  const verification = identity?.verification;
  const pending = verification && !["done", "cancelled"].includes(verification.phase);
  const [peerMode] = useState(() => userVerification || Boolean(pending && verification?.userId !== session?.userId));

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    void runtime.refreshIdentity().catch((cause) => setError(cause instanceof Error ? cause.message : "Unable to load identity."));
    return () => { element?.close(); runtime.clearIdentitySecrets(); };
  }, [runtime]);

  const run = async (action: () => Promise<void>) => {
    setWorking(true); setError(null);
    try { await action(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Operation failed."); }
    finally { setWorking(false); }
  };
  const close = () => { if (!busy && !identity?.newRecoveryKey) onClose(); };
  const recover = (event: FormEvent) => {
    event.preventDefault(); const input = key; setKey("");
    void run(() => runtime.recoverIdentity(input));
  };
  const authenticate = (event: FormEvent) => {
    event.preventDefault(); runtime.submitIdentityAuth(password || undefined); setPassword("");
  };
  const openAuth = async () => {
    if (!identity?.auth) return;
    const url = identity.auth.url;
    if (window.desktop) await window.desktop.auth.openExternal(url);
    else window.open(url, "_blank", "noopener,noreferrer");
  };

  return <dialog ref={dialog} className="people-dialog identity-dialog" aria-labelledby="identity-title" onCancel={(event) => { event.preventDefault(); close(); }}>
    <header className="people-dialog__header">
      <div><span className="eyebrow">SECURITY</span><h2 id="identity-title"><ShieldCheck size={23} /> {peerMode ? "Verify user" : "Identity & encryption"}</h2></div>
      <button type="button" className="icon-button" aria-label="Close" disabled={busy || Boolean(identity?.newRecoveryKey)} onClick={close}><X /></button>
    </header>
    {!peerMode && <div className="identity-device"><strong>{session?.userId}</strong><small>This device: {identity?.deviceId || session?.deviceId}</small>
      <span className={identity?.verified ? "identity-verified" : "identity-unverified"}>{identity?.available ? identity.verified ? "Device verified" : "Device not yet verified" : "Loading status…"}</span>
    </div>}
    {(error || identity?.error) && <p className="error-banner" role="alert">{error || identity?.error}</p>}
    {identity?.notice && <p className="success-banner" role="status">{identity.notice}</p>}

    {identity?.auth ? <form className="auth-form identity-section" onSubmit={authenticate}>
      <h3>Verify with your homeserver</h3>
      {identity.auth.error && <p className="error-banner">{identity.auth.error}</p>}
      {identity.auth.stage === "m.login.password" ? <>
        <label htmlFor="identity-password">Account password</label>
        <input id="identity-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
      </> : <>
        <p>Confirm the operation in your browser, then return here.</p>
        <button type="button" className="button button--secondary" onClick={() => void openAuth().catch((cause) => setError(String(cause)))}>Open verification in browser</button>
      </>}
      <button type="submit" className="button button--primary">Continue verification</button>
      <button type="button" className="button button--secondary" onClick={() => runtime.cancelIdentityAuth()}>Cancel operation</button>
    </form> : <>
      <section className="identity-section">
        <h3>{peerMode ? "Compare with your contact" : "Verify with another device"}</h3>
        <p>{peerMode ? "Contact this person through a channel you trust. Compare the emojis or numbers shown in both Matrix sessions before confirming a match." : "Open an already verified Matrix session, such as Element on your phone. Compare the emojis on both devices."}</p>
        {!pending && <button type="button" className="button button--secondary" disabled={busy || !identity?.available || Boolean(identity.newRecoveryKey)} onClick={() => void run(() => peerMode && verification ? runtime.requestUserVerification(verification.userId) : runtime.requestIdentityVerification())}>Request verification</button>}
        {verification && <div className="verification-card" aria-live="polite">
          <strong>{verification.userId}</strong><small>{verification.deviceId ? `Other device: ${verification.deviceId}` : "Selecting the other device."}</small>
          {verification.phase === "requested" && <>
            <p>{verification.incoming ? peerMode ? "This user wants to verify your identity." : "This device wants to verify your identity." : peerMode ? "Waiting for the other user to accept." : "Waiting for the other device to accept."}</p>
            {verification.incoming && <button type="button" className="button button--compact" disabled={busy} onClick={() => void run(() => runtime.acceptIdentityVerification())}>Accept request</button>}
          </>}
          {verification.phase === "ready" && <button type="button" className="button button--compact" disabled={busy} onClick={() => void run(() => runtime.startIdentityComparison())}>Start emoji comparison</button>}
          {verification.phase === "started" && !verification.emoji && !verification.decimal && <p>Verification in progress. Follow the steps on the other device too.</p>}
          {verification.emoji && <div className="verification-emojis">{verification.emoji.map(([emoji, name], index) => <div key={index}><span>{emoji}</span><small>{name}</small></div>)}</div>}
          {verification.decimal && !verification.emoji && <div className="verification-numbers">{verification.decimal.join(" · ")}</div>}
          {(verification.emoji || verification.decimal) && <>
            <p>Do all symbols match in the same order on both devices?</p>
            <div className="identity-actions"><button type="button" className="button button--compact" disabled={busy} onClick={() => void run(() => runtime.confirmIdentityComparison(true))}>Yes, they match</button>
              <button type="button" className="button button--secondary button--compact" disabled={busy} onClick={() => void run(() => runtime.confirmIdentityComparison(false))}>No, cancel</button></div>
          </>}
          {verification.phase === "done" && <p className="identity-verified">Verification completed successfully.</p>}
          {verification.phase === "cancelled" && <p>Verification cancelled or expired.</p>}
          {pending && <button type="button" className="back-button registration-reset" disabled={busy} onClick={() => void run(() => runtime.cancelIdentityVerification())}>Cancel verification</button>}
        </div>}
      </section>

      {!peerMode && <><form className="auth-form identity-section" onSubmit={recover}>
        <h3>Verify with a recovery key</h3>
        <p>Enter the recovery key for your existing identity. Any available message backup will also be loaded.</p>
        <label htmlFor="identity-recovery">Recovery key</label>
        <input id="identity-recovery" type="password" value={key} onChange={(event) => setKey(event.target.value)} autoComplete="off" spellCheck={false} disabled={busy || Boolean(pending) || Boolean(identity?.newRecoveryKey)} placeholder="EsT…" />
        <button type="submit" className="button button--secondary" disabled={busy || !key.trim() || Boolean(pending) || Boolean(identity?.newRecoveryKey)}>Recover identity</button>
      </form>

      <section className="identity-section identity-reset">
        <h3>{identity?.hasIdentity ? "Replace identity" : "Set up a new identity"}</h3>
        <p>If you no longer have a verified device or your old recovery key, you can set up a new identity.</p>
        <p className="identity-warning">This replaces your existing identity, old recovery key, and key backups on the server. Older messages may become permanently unreadable. Other devices and contacts will need to verify your new identity. This does not restore keys that are already missing.</p>
        {!identity?.newRecoveryKey ? <button type="button" className="button button--secondary" disabled={busy || Boolean(pending) || !identity?.available} onClick={() => { setSaved(false); setUnderstood(false); void run(() => runtime.prepareIdentityReset()); }}>Prepare new identity</button> : <>
          <label htmlFor="new-recovery-key">Store your new recovery key safely</label>
          <textarea id="new-recovery-key" className="recovery-key" value={identity.newRecoveryKey} readOnly rows={3} spellCheck={false} onFocus={(event) => event.target.select()} />
          <label className="identity-check"><input type="checkbox" checked={saved} onChange={(event) => setSaved(event.target.checked)} disabled={busy} /> I have saved the new key outside this app.</label>
          {!identity.resetComplete && <>
            <label className="identity-check"><input type="checkbox" checked={understood} onChange={(event) => setUnderstood(event.target.checked)} disabled={busy} /> I understand the consequences and want to replace my existing identity and backups.</label>
            <button type="button" className="button identity-danger" disabled={busy || !saved || !understood} onClick={() => void run(() => runtime.resetIdentity(saved && understood))}>{busy ? "Setting up identity…" : "Replace identity now"}</button>
          </>}
          <button type="button" className="button button--secondary" disabled={busy || (identity.resetComplete && !saved)} onClick={() => { runtime.clearIdentitySecrets(); setSaved(false); setUnderstood(false); }}>{identity.resetComplete ? "Key saved – done" : "Cancel preparation"}</button>
        </>}
      </section></>}
    </>}
    {busy && !identity?.auth && <p className="identity-progress" role="status">Please wait…</p>}
  </dialog>;
}
