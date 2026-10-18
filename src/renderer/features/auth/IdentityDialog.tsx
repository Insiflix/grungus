import { useEffect, useRef, useState, type FormEvent } from "react";
import { ShieldCheck, X } from "lucide-react";
import { useMatrixRuntime } from "../../app/providers/MatrixProvider";
import { useMatrixSnapshot } from "../../hooks/matrix/useMatrixSnapshot";

export function IdentityDialog({ onClose }: { onClose: () => void }) {
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

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    void runtime.refreshIdentity().catch((cause) => setError(cause instanceof Error ? cause.message : "Identität konnte nicht geladen werden."));
    return () => { element?.close(); runtime.clearIdentitySecrets(); };
  }, [runtime]);

  const run = async (action: () => Promise<void>) => {
    setWorking(true); setError(null);
    try { await action(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Vorgang fehlgeschlagen."); }
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
      <div><span className="eyebrow">SICHERHEIT</span><h2 id="identity-title"><ShieldCheck size={23} /> Identität & Verschlüsselung</h2></div>
      <button type="button" className="icon-button" aria-label="Schließen" disabled={busy || Boolean(identity?.newRecoveryKey)} onClick={close}><X /></button>
    </header>
    <div className="identity-device"><strong>{session?.userId}</strong><small>Dieses Gerät: {identity?.deviceId || session?.deviceId}</small>
      <span className={identity?.verified ? "identity-verified" : "identity-unverified"}>{identity?.available ? identity.verified ? "Gerät bestätigt" : "Gerät noch nicht bestätigt" : "Status wird geladen…"}</span>
    </div>
    {(error || identity?.error) && <p className="error-banner" role="alert">{error || identity?.error}</p>}
    {identity?.notice && <p className="success-banner" role="status">{identity.notice}</p>}

    {identity?.auth ? <form className="auth-form identity-section" onSubmit={authenticate}>
      <h3>Beim Homeserver bestätigen</h3>
      {identity.auth.error && <p className="error-banner">{identity.auth.error}</p>}
      {identity.auth.stage === "m.login.password" ? <>
        <label htmlFor="identity-password">Kontopasswort</label>
        <input id="identity-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
      </> : <>
        <p>Bestätige den Vorgang im Browser und kehre danach hierher zurück.</p>
        <button type="button" className="button button--secondary" onClick={() => void openAuth().catch((cause) => setError(String(cause)))}>Bestätigung im Browser öffnen</button>
      </>}
      <button type="submit" className="button button--primary">Bestätigung fortsetzen</button>
      <button type="button" className="button button--secondary" onClick={() => runtime.cancelIdentityAuth()}>Vorgang abbrechen</button>
    </form> : <>
      <section className="identity-section">
        <h3>Mit einem anderen Gerät bestätigen</h3>
        <p>Öffne eine bereits bestätigte Matrix-Sitzung, zum Beispiel Element auf deinem Handy. Vergleiche die Emojis auf beiden Geräten.</p>
        {!pending && <button type="button" className="button button--secondary" disabled={busy || !identity?.available || Boolean(identity.newRecoveryKey)} onClick={() => void run(() => runtime.requestIdentityVerification())}>Bestätigung anfragen</button>}
        {verification && <div className="verification-card" aria-live="polite">
          <strong>{verification.userId}</strong><small>{verification.deviceId ? `Anderes Gerät: ${verification.deviceId}` : "Das andere Gerät wird ausgewählt."}</small>
          {verification.phase === "requested" && <>
            <p>{verification.incoming ? "Dieses Gerät möchte deine Identität vergleichen." : "Warte auf die Annahme am anderen Gerät."}</p>
            {verification.incoming && <button type="button" className="button button--compact" disabled={busy} onClick={() => void run(() => runtime.acceptIdentityVerification())}>Anfrage annehmen</button>}
          </>}
          {verification.phase === "ready" && <button type="button" className="button button--compact" disabled={busy} onClick={() => void run(() => runtime.startIdentityComparison())}>Emoji-Vergleich starten</button>}
          {verification.phase === "started" && !verification.emoji && !verification.decimal && <p>Vergleich läuft. Folge auch den Schritten am anderen Gerät.</p>}
          {verification.emoji && <div className="verification-emojis">{verification.emoji.map(([emoji, name], index) => <div key={index}><span>{emoji}</span><small>{name}</small></div>)}</div>}
          {verification.decimal && !verification.emoji && <div className="verification-numbers">{verification.decimal.join(" · ")}</div>}
          {(verification.emoji || verification.decimal) && <>
            <p>Stimmen alle Zeichen in derselben Reihenfolge auf beiden Geräten überein?</p>
            <div className="identity-actions"><button type="button" className="button button--compact" disabled={busy} onClick={() => void run(() => runtime.confirmIdentityComparison(true))}>Ja, sie stimmen überein</button>
              <button type="button" className="button button--secondary button--compact" disabled={busy} onClick={() => void run(() => runtime.confirmIdentityComparison(false))}>Nein, abbrechen</button></div>
          </>}
          {verification.phase === "done" && <p className="identity-verified">Vergleich erfolgreich abgeschlossen.</p>}
          {verification.phase === "cancelled" && <p>Bestätigung abgebrochen oder abgelaufen.</p>}
          {pending && <button type="button" className="back-button registration-reset" disabled={busy} onClick={() => void run(() => runtime.cancelIdentityVerification())}>Bestätigung abbrechen</button>}
        </div>}
      </section>

      <form className="auth-form identity-section" onSubmit={recover}>
        <h3>Mit Wiederherstellungsschlüssel bestätigen</h3>
        <p>Gib den Sicherheitsschlüssel deiner bestehenden Identität ein. Ein vorhandenes Nachrichten-Backup wird ebenfalls geladen.</p>
        <label htmlFor="identity-recovery">Wiederherstellungsschlüssel</label>
        <input id="identity-recovery" type="password" value={key} onChange={(event) => setKey(event.target.value)} autoComplete="off" spellCheck={false} disabled={busy || Boolean(pending) || Boolean(identity?.newRecoveryKey)} placeholder="EsT…" />
        <button type="submit" className="button button--secondary" disabled={busy || !key.trim() || Boolean(pending) || Boolean(identity?.newRecoveryKey)}>Identität wiederherstellen</button>
      </form>

      <section className="identity-section identity-reset">
        <h3>{identity?.hasIdentity ? "Identität ersetzen" : "Identität neu einrichten"}</h3>
        <p>Wenn kein bestätigtes Gerät und kein alter Wiederherstellungsschlüssel mehr verfügbar sind, kannst du eine neue Identität einrichten.</p>
        <p className="identity-warning">Dabei werden die bisherige Identität, der alte Wiederherstellungsschlüssel und die Schlüssel-Backups auf dem Server ersetzt. Ältere Nachrichten können dauerhaft unlesbar werden. Andere Geräte und Kontakte müssen die neue Identität erneut bestätigen. Bereits fehlende Schlüssel werden dadurch nicht wiederhergestellt.</p>
        {!identity?.newRecoveryKey ? <button type="button" className="button button--secondary" disabled={busy || Boolean(pending) || !identity?.available} onClick={() => { setSaved(false); setUnderstood(false); void run(() => runtime.prepareIdentityReset()); }}>Neue Identität vorbereiten</button> : <>
          <label htmlFor="new-recovery-key">Neuen Wiederherstellungsschlüssel sicher aufbewahren</label>
          <textarea id="new-recovery-key" className="recovery-key" value={identity.newRecoveryKey} readOnly rows={3} spellCheck={false} onFocus={(event) => event.target.select()} />
          <label className="identity-check"><input type="checkbox" checked={saved} onChange={(event) => setSaved(event.target.checked)} disabled={busy} /> Ich habe den neuen Schlüssel außerhalb dieser App gesichert.</label>
          {!identity.resetComplete && <>
            <label className="identity-check"><input type="checkbox" checked={understood} onChange={(event) => setUnderstood(event.target.checked)} disabled={busy} /> Ich verstehe die Folgen und möchte die bisherige Identität und Backups ersetzen.</label>
            <button type="button" className="button identity-danger" disabled={busy || !saved || !understood} onClick={() => void run(() => runtime.resetIdentity(saved && understood))}>{busy ? "Identität wird eingerichtet…" : "Identität jetzt ersetzen"}</button>
          </>}
          <button type="button" className="button button--secondary" disabled={busy || (identity.resetComplete && !saved)} onClick={() => { runtime.clearIdentitySecrets(); setSaved(false); setUnderstood(false); }}>{identity.resetComplete ? "Schlüssel gesichert – fertig" : "Vorbereitung abbrechen"}</button>
        </>}
      </section>
    </>}
    {busy && !identity?.auth && <p className="identity-progress" role="status">Bitte warten…</p>}
  </dialog>;
}
