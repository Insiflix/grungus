import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Plus as PlusIcon, SendHorizontal as SendIcon } from "lucide-react";

interface MessageComposerProps {
  roomName: string;
  onSend(body: string): Promise<void>;
  onTyping(typing: boolean): void;
}

export function MessageComposer({ roomName, onSend, onTyping }: MessageComposerProps) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const typingTimer = useRef<number | null>(null);
  const onTypingRef = useRef(onTyping);
  onTypingRef.current = onTyping;

  useEffect(() => () => {
    if (typingTimer.current) window.clearTimeout(typingTimer.current);
    onTypingRef.current(false);
  }, [roomName]);

  const updateBody = (value: string) => {
    setBody(value);
    onTyping(Boolean(value));
    if (typingTimer.current) window.clearTimeout(typingTimer.current);
    typingTimer.current = window.setTimeout(() => onTyping(false), 4_000);
  };

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    const message = body.trim();
    if (!message || sending) return;
    setBody("");
    setSending(true);
    onTyping(false);
    try {
      await onSend(message);
    } catch {
      setBody(message);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  };

  return (
    <form className="composer" onSubmit={(event) => void submit(event)}>
      <button type="button" className="composer__add" aria-label="Attachments are planned" title="Attachments are planned">
        <PlusIcon />
      </button>
      <textarea
        value={body}
        onChange={(event) => updateBody(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={`Message ${roomName}`}
        aria-label={`Message ${roomName}`}
        rows={1}
        disabled={sending}
      />
      <span className="composer__hint">Shift + Enter for a new line</span>
      <button className="composer__send" type="submit" disabled={!body.trim() || sending} aria-label="Send message">
        <SendIcon />
      </button>
    </form>
  );
}

