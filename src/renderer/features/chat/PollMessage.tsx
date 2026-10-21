import { useEffect, useRef, useState } from "react";
import { BarChart3, Check } from "lucide-react";
import type { MatrixMessage } from "../../../domain/matrix/MatrixTypes";
import type { PollSnapshot } from "../../../domain/messaging/Polls";
import { useMatrixRuntime } from "../../app/providers/MatrixProvider";

export function PollMessage({ message }: { message: MatrixMessage }) {
  const runtime = useMatrixRuntime();
  const poll = message.poll!;
  const [snapshot, setSnapshot] = useState<PollSnapshot | null>(null);
  const [selection, setSelection] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const lock = useRef(false);
  useEffect(() => {
    setSnapshot(null); setError("");
    if (message.sendState !== "sent") return;
    try { return runtime.observePoll(message.roomId, message.id, setSnapshot); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load poll."); }
  }, [runtime, message.roomId, message.id, message.sendState, reload]);
  const ownKey = JSON.stringify(snapshot?.ownAnswers ?? []);
  useEffect(() => { setSelection(JSON.parse(ownKey) as string[]); }, [ownKey]);
  const run = async (action: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try { await action(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update poll."); }
    finally { lock.current = false; setBusy(false); }
  };
  const disabled = busy || message.sendState !== "sent" || !snapshot || snapshot.loading || Boolean(snapshot.error) || snapshot.ended;
  const showResults = snapshot && (poll.disclosed || snapshot.ended) && !snapshot.loading && !snapshot.error;
  const unchanged = [...selection].sort().join("\n") === [...(snapshot?.ownAnswers ?? [])].sort().join("\n");
  return <section className="poll-message" aria-label={`Poll: ${poll.question}`}>
    <span className="poll-caption"><BarChart3 size={15} /> {snapshot?.ended ? "Poll ended" : "Poll"}{poll.maxSelections > 1 ? ` · Choose up to ${poll.maxSelections}` : " · Choose one"}</span>
    <h3>{poll.question}</h3>
    <div className="poll-options">{poll.answers.map(answer => {
      const count = snapshot?.counts[answer.id] ?? 0;
      const percent = snapshot?.totalVoters ? Math.round(count / snapshot.totalVoters * 100) : 0;
      return <label className={`poll-option ${selection.includes(answer.id) ? "is-chosen" : ""}`} key={answer.id}>
        {showResults && <span className="poll-option-fill" style={{ width: `${percent}%` }} />}
        <input type={poll.maxSelections === 1 ? "radio" : "checkbox"} name={`poll-${message.id}`} checked={selection.includes(answer.id)} disabled={disabled || (poll.maxSelections > 1 && !selection.includes(answer.id) && selection.length >= poll.maxSelections)} onChange={event => setSelection(current => poll.maxSelections === 1 ? [answer.id] : event.target.checked ? [...current, answer.id] : current.filter(id => id !== answer.id))} />
        <span>{answer.text}{snapshot?.ownAnswers.includes(answer.id) && <Check size={14} aria-label="Your vote" />}</span>{showResults && <small>{count} · {percent}%</small>}
      </label>;
    })}</div>
    {snapshot?.loading && <p role="status">Loading votes...</p>}
    {showResults && <p>{snapshot.totalVoters} {snapshot.totalVoters === 1 ? "voter" : "voters"}</p>}
    {!poll.disclosed && !snapshot?.ended && <p>Results are hidden until this poll ends.</p>}
    {snapshot?.incomplete && <p role="status">Some votes could not be decrypted. Results may be incomplete.</p>}
    {(error || snapshot?.error) && <p className="settings-inline-error" role="alert">{error || snapshot?.error} <button type="button" disabled={busy} onClick={() => setReload(value => value + 1)}>Refresh poll</button></p>}
    {!snapshot?.ended && <footer><button type="button" className="button button--compact" disabled={disabled || selection.length === 0 || unchanged} onClick={() => void run(() => runtime.votePoll(message.roomId, message.id, selection))}>{busy ? "Saving..." : snapshot?.ownAnswers.length ? "Update vote" : "Vote"}</button>
      {Boolean(snapshot?.ownAnswers.length) && <button type="button" className="button button--secondary button--compact" disabled={disabled} onClick={() => void run(() => runtime.votePoll(message.roomId, message.id, []))}>Remove vote</button>}
      {snapshot?.canEnd && <button type="button" className="button button--secondary button--compact" disabled={disabled} onClick={() => void run(() => runtime.endPoll(message.roomId, message.id))}>End poll</button>}
    </footer>}
  </section>;
}
