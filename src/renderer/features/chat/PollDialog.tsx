import { useEffect, useRef, useState, type FormEvent } from "react";
import { Plus, X } from "lucide-react";
import { validatePollInput, type PollInput } from "../../../domain/messaging/Polls";
import { PendingMessageError } from "../../../domain/messaging/PendingMessageError";

export function PollDialog({ onSend, onClose }: { onSend: (input: PollInput) => Promise<unknown>; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [question, setQuestion] = useState("");
  const [answers, setAnswers] = useState(["", ""]);
  const [multiple, setMultiple] = useState(false);
  const [maxSelections, setMaxSelections] = useState(2);
  const [disclosed, setDisclosed] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  useEffect(() => { const node = dialog.current; node?.showModal(); return () => node?.close(); }, []);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (lock.current || pending) return;
    setError("");
    try {
      const input = validatePollInput({ question, answers, maxSelections: multiple ? maxSelections : 1, disclosed });
      lock.current = true; setBusy(true);
      await onSend(input); onClose();
    } catch (cause) {
      const isPending = cause instanceof PendingMessageError;
      setPending(isPending);
      setError(isPending ? "The poll could not be sent. Use Retry or Cancel on the poll in chat." : cause instanceof Error ? cause.message : "Could not send poll.");
    } finally { lock.current = false; setBusy(false); }
  };
  return <dialog ref={dialog} className="poll-dialog" aria-labelledby="create-poll-title" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <header><h2 id="create-poll-title">Create poll</h2><button type="button" className="icon-button" aria-label="Close poll editor" disabled={busy} onClick={onClose}><X /></button></header>
    <form onSubmit={event => void submit(event)}>
      <fieldset disabled={busy || pending}>
        <label>Question<input autoFocus required maxLength={300} value={question} onChange={event => setQuestion(event.target.value)} /></label>
        <div className="poll-editor-answers">{answers.map((answer, index) => <div key={index}><label>Answer {index + 1}<input required maxLength={200} value={answer} onChange={event => setAnswers(current => current.map((value, i) => i === index ? event.target.value : value))} /></label><button type="button" className="icon-button" aria-label={`Remove answer ${index + 1}`} disabled={answers.length <= 2} onClick={() => { setAnswers(current => current.filter((_, i) => i !== index)); setMaxSelections(value => Math.min(value, answers.length - 1)); }}><X size={16} /></button></div>)}</div>
        <button type="button" className="button button--secondary button--compact" disabled={answers.length >= 20} onClick={() => setAnswers(current => [...current, ""])}><Plus size={15} /> Add answer</button>
        <label className="poll-editor-toggle"><input type="checkbox" checked={multiple} onChange={event => setMultiple(event.target.checked)} /> Allow multiple choices</label>
        {multiple && <label>Maximum choices<input type="number" min={1} max={answers.length} value={maxSelections} onChange={event => setMaxSelections(Number(event.target.value))} /></label>}
        <label className="poll-editor-toggle"><input type="checkbox" checked={!disclosed} onChange={event => setDisclosed(!event.target.checked)} /> Hide results until poll ends</label>
      </fieldset>
      {error && <p className="settings-inline-error" role="alert">{error}</p>}
      <footer><button type="button" className="button button--secondary" disabled={busy} onClick={onClose}>Cancel</button><button type="submit" className="button button--primary" disabled={busy || pending}>{busy ? "Sending..." : "Send poll"}</button></footer>
    </form>
  </dialog>;
}
