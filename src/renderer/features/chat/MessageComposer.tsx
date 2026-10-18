import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Plus as PlusIcon, SendHorizontal as SendIcon, Smile } from "lucide-react";
import { createGifMessage } from "../../../domain/messaging/GifMessage";
import { GifPicker } from "./GifPicker";
import { EmojiPicker } from "./EmojiPicker";
import { emojiQueryAt, insertEmojiAt, nativeEmoji, replaceEmojiShortcodes, searchEmojis } from "../../../domain/messaging/Emojis";

interface MessageComposerProps {
  roomName: string;
  onSend(body: string): Promise<void>;
  onTyping(typing: boolean): void;
}

export function MessageComposer({ roomName, onSend, onTyping }: MessageComposerProps) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [gifOpen, setGifOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [caret, setCaret] = useState(0);
  const [activeEmoji, setActiveEmoji] = useState(0);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const selection = useRef({ start: 0, end: 0 });
  const suggestionList = useRef<HTMLDivElement>(null);
  const suggestionId = useId();
  const token = emojiQueryAt(body, caret);
  const tokenId = token ? `${token.start}:${token.query}` : null;
  const suggestions = token && tokenId !== dismissed && !sending && !gifOpen && !emojiOpen ? searchEmojis(token.query) : [];
  const sendLock = useRef(false);
  const typingTimer = useRef<number | null>(null);
  const onTypingRef = useRef(onTyping);
  onTypingRef.current = onTyping;

  useEffect(() => {
    suggestionList.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [activeEmoji, tokenId]);

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

  const pickEmoji = (emoji: string, complete = false) => {
    const range = complete && token ? { start: token.start, end: token.end + (body[token.end] === ":" ? 1 : 0) } : selection.current;
    const result = insertEmojiAt(body, range.start, range.end, emoji);
    updateBody(result.text); setCaret(result.caret); setActiveEmoji(0); setDismissed(null);
    selection.current = { start: result.caret, end: result.caret };
    window.requestAnimationFrame(() => { textarea.current?.focus(); textarea.current?.setSelectionRange(result.caret, result.caret); });
  };

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    const message = replaceEmojiShortcodes(body.trim());
    if (!message || sendLock.current) return;
    sendLock.current = true;
    setBody("");
    setCaret(0); selection.current = { start: 0, end: 0 };
    setSending(true);
    onTyping(false);
    try {
      await onSend(message);
    } catch {
      setBody(message);
      setCaret(message.length); selection.current = { start: message.length, end: message.length };
    } finally {
      sendLock.current = false;
      setSending(false);
    }
  };

  const sendGif = async (url: string) => {
    if (sendLock.current) throw new Error("Eine Nachricht wird bereits gesendet.");
    const message = createGifMessage(url);
    sendLock.current = true; setSending(true); onTyping(false);
    try { await onSend(message); }
    finally { sendLock.current = false; setSending(false); }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (suggestions.length && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault(); setActiveEmoji((current) => (current + (event.key === "ArrowDown" ? 1 : -1) + suggestions.length) % suggestions.length); return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault(); pickEmoji(nativeEmoji(suggestions[activeEmoji] ?? suggestions[0]), true); return;
      }
      if (event.key === "Escape") { event.preventDefault(); setDismissed(tokenId); return; }
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  };

  return (
    <>
    <form className="composer composer--gifs composer--emojis" onSubmit={(event) => void submit(event)}>
      <button type="button" className="composer__add" aria-label="Attachments are planned" title="Attachments are planned">
        <PlusIcon />
      </button>
      <div className="composer__input">
      {suggestions.length > 0 && <div className="emoji-suggestions" role="listbox" id={suggestionId} aria-label="Emoji-Vorschläge" ref={suggestionList}>
        {suggestions.map((emoji, index) => <button type="button" role="option" id={`${suggestionId}-${index}`} key={emoji.id} aria-selected={index === activeEmoji} onMouseDown={(event) => event.preventDefault()} onMouseEnter={() => setActiveEmoji(index)} onClick={() => pickEmoji(nativeEmoji(emoji), true)}>
          <span>{nativeEmoji(emoji)}</span><strong>:{emoji.id}:</strong><small>{emoji.name}</small>
        </button>)}<footer>↑ ↓ auswählen · Enter / Tab einfügen · Esc schließen</footer>
      </div>}
      <textarea
        ref={textarea}
        value={body}
        onChange={(event) => { updateBody(event.target.value); setCaret(event.target.selectionStart); selection.current = { start: event.target.selectionStart, end: event.target.selectionEnd }; setActiveEmoji(0); setDismissed(null); }}
        onSelect={(event) => { setCaret(event.currentTarget.selectionStart); selection.current = { start: event.currentTarget.selectionStart, end: event.currentTarget.selectionEnd }; }}
        onKeyDown={handleKeyDown}
        placeholder={`Message ${roomName}`}
        aria-label={`Message ${roomName}`}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={suggestions.length > 0}
        aria-controls={suggestions.length ? suggestionId : undefined}
        aria-activedescendant={suggestions.length ? `${suggestionId}-${activeEmoji}` : undefined}
        rows={1}
        disabled={sending}
      />
      </div>
      <span className="composer__hint">Shift + Enter for a new line</span>
      <button type="button" className="composer__emoji icon-button" aria-label="Emoji auswählen" title="Emojis" aria-haspopup="dialog" aria-expanded={emojiOpen} disabled={sending} onClick={() => setEmojiOpen(true)}><Smile /></button>
      <button type="button" className="composer__gif" aria-label="GIF suchen und senden" title="GIF suchen" aria-haspopup="dialog" aria-expanded={gifOpen} disabled={sending} onClick={() => setGifOpen(true)}>GIF</button>
      <button className="composer__send" type="submit" disabled={!body.trim() || sending} aria-label="Send message">
        <SendIcon />
      </button>
    </form>
    {gifOpen && <GifPicker onSend={sendGif} onClose={() => setGifOpen(false)} />}
    {emojiOpen && <EmojiPicker onPick={(emoji) => pickEmoji(emoji, Boolean(token))} onClose={() => setEmojiOpen(false)} />}
    </>
  );
}

