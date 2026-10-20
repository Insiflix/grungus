import { AttachmentDraft, AttachmentDropOverlay, useAttachmentDraft } from "./AttachmentDraft";
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Plus as PlusIcon, SendHorizontal as SendIcon, Smile } from "lucide-react";
import { createGifMessage } from "../../../domain/messaging/GifMessage";
import { GifPicker } from "./GifPicker";
import { EmojiPicker } from "./EmojiPicker";
import { usePreferences } from "../../hooks/usePreferences";
import { emojiQueryAt, insertEmojiAt, nativeEmoji, replaceEmojiShortcodes, searchEmojis } from "../../../domain/messaging/Emojis";
import type { MatrixMessage, MatrixRoomMember } from "../../../domain/matrix/MatrixTypes";
import { mentionQueryAt, searchMentionMembers } from "../../../domain/messaging/Mentions";
import { TypingNotifications } from "./TypingNotifications";
import { Avatar } from "../../components/common/Avatar";

interface MessageComposerProps {
  roomName: string;
  onSend(body: string): Promise<void>;
  onTyping(typing: boolean): void;
  getUploadLimit?: () => Promise<number | null>;
  onSendAttachment?: (file: File, onProgress: (percent: number) => void) => Promise<void>;
  editing?: MatrixMessage | null;
  replying?: MatrixMessage | null;
  onCancelAction?: () => void;
  members?: MatrixRoomMember[];
}

export function MessageComposer({ roomName, onSend, onTyping, onSendAttachment, getUploadLimit, editing, replying, onCancelAction, members = [] }: MessageComposerProps) {
  const prefs = usePreferences();
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const attachments = useAttachmentDraft(form, Boolean(onSendAttachment) && !sending && !editing);
  const [uploadLimit, setUploadLimit] = useState<number | null | undefined>(undefined);
  const [limitError, setLimitError] = useState(false);
  const [limitRetry, setLimitRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setUploadLimit(undefined); setLimitError(false);
    if (getUploadLimit) void getUploadLimit().then(limit => { if (active) setUploadLimit(limit); }).catch(() => { if (active) setLimitError(true); });
    return () => { active = false; };
  }, [getUploadLimit, limitRetry]);
  const oversized = typeof uploadLimit === "number" ? attachments.files.filter(item => item.file.size > uploadLimit) : [];
  const attachmentsBlocked = !editing && attachments.files.length > 0 && (oversized.length > 0 || Boolean(getUploadLimit && (uploadLimit === undefined || limitError)));
  const [uploadProgress, setUploadProgress] = useState<{ id: string; percent: number } | null>(null);
  const [sendError, setSendError] = useState("");
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
  const mentionToken = mentionQueryAt(body, caret);
  const mentionId = mentionToken ? `mention:${mentionToken.start}:${mentionToken.query}` : null;
  const mentionSuggestions = mentionToken && mentionId !== dismissed && !sending && !gifOpen && !emojiOpen
    ? searchMentionMembers(members.filter(member => member.membership === "join"), mentionToken.query) : [];
  const suggestionCount = mentionSuggestions.length || suggestions.length;
  const sendLock = useRef(false);
  const onTypingRef = useRef(onTyping);
  const typingNotifications = useRef<TypingNotifications | null>(null);
  if (!typingNotifications.current) typingNotifications.current = new TypingNotifications(typing => onTypingRef.current(typing));
  const draft = useRef("");
  const wasEditing = useRef(false);
  useEffect(() => {
    if (editing) {
      if (!wasEditing.current) draft.current = body;
      setBody(editing.body); setCaret(editing.body.length);
      selection.current = { start: editing.body.length, end: editing.body.length };
    } else if (wasEditing.current) {
      setBody(draft.current);
      setCaret(draft.current.length);
      selection.current = { start: draft.current.length, end: draft.current.length };
      draft.current = "";
    }
    wasEditing.current = Boolean(editing);
    textarea.current?.focus();
  }, [editing?.id]);
  useEffect(() => { if (replying) textarea.current?.focus(); }, [replying?.id]);
  onTypingRef.current = onTyping;

  useEffect(() => {
    suggestionList.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [activeEmoji, tokenId, mentionId]);

  useEffect(() => () => {
    typingNotifications.current?.stop();
  }, [roomName]);

  const updateBody = (value: string) => {
    setBody(value);
    typingNotifications.current?.update(Boolean(value));
  };

  const pickEmoji = (emoji: string, complete = false) => {
    const range = complete && token ? { start: token.start, end: token.end + (body[token.end] === ":" ? 1 : 0) } : selection.current;
    const result = insertEmojiAt(body, range.start, range.end, emoji);
    updateBody(result.text); setCaret(result.caret); setActiveEmoji(0); setDismissed(null);
    selection.current = { start: result.caret, end: result.caret };
    window.requestAnimationFrame(() => { textarea.current?.focus(); textarea.current?.setSelectionRange(result.caret, result.caret); });
  };

  const pickMention = (member: MatrixRoomMember) => {
    if (!mentionToken) return;
    const result = insertEmojiAt(body, mentionToken.start, mentionToken.end, `${member.id} `);
    updateBody(result.text); setCaret(result.caret); setActiveEmoji(0); setDismissed(null);
    selection.current = { start: result.caret, end: result.caret };
    window.requestAnimationFrame(() => { textarea.current?.focus(); textarea.current?.setSelectionRange(result.caret, result.caret); });
  };

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    const message = prefs.convertEmoji ? replaceEmojiShortcodes(body.trim()) : body.trim();
    const pendingFiles = editing ? [] : attachments.files;
    if ((!message && !pendingFiles.length) || sendLock.current) return;
    if (attachmentsBlocked) return;
    let messageSent = !message;
    sendLock.current = true;
    setSendError("");
    setBody("");
    setCaret(0); selection.current = { start: 0, end: 0 };
    setSending(true);
    typingNotifications.current?.stop();
    try {
      if (message) { await onSend(message); messageSent = true; }
      for (const item of pendingFiles) {
        if (!onSendAttachment) throw new Error("File uploads are unavailable.");
        await onSendAttachment(item.file, percent => setUploadProgress({ id: item.id, percent }));
        attachments.remove(item.id);
      }
    } catch (error) {
      setSendError(error instanceof Error ? error.message : "Message could not be saved. Please try again.");
      if (!messageSent) { setBody(message);
      setCaret(message.length); selection.current = { start: message.length, end: message.length }; }
    } finally {
      sendLock.current = false;
      setUploadProgress(null);
      setSending(false);
    }
  };

  const sendGif = async (url: string) => {
    if (sendLock.current) throw new Error("Eine Nachricht wird bereits gesendet.");
    const message = createGifMessage(url);
    sendLock.current = true; setSending(true); typingNotifications.current?.stop();
    try { await onSend(message); }
    finally { sendLock.current = false; setSending(false); }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (event.key === "Escape" && (editing || replying) && !suggestionCount) { event.preventDefault(); onCancelAction?.(); return; }
    if (suggestionCount && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault(); setActiveEmoji((current) => (current + (event.key === "ArrowDown" ? 1 : -1) + suggestionCount) % suggestionCount); return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        if (mentionSuggestions.length) pickMention(mentionSuggestions[activeEmoji] ?? mentionSuggestions[0]);
        else pickEmoji(nativeEmoji(suggestions[activeEmoji] ?? suggestions[0]), true);
        return;
      }
      if (event.key === "Escape") { event.preventDefault(); setDismissed(mentionSuggestions.length ? mentionId : tokenId); return; }
    }
    if (event.key === "Enter" && !event.shiftKey && (prefs.sendWithEnter || event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void submit();
    }
  };

  return (
    <>
    {attachments.dragging && <AttachmentDropOverlay />}
    {attachments.files.length > 0 && !editing && <AttachmentDraft files={attachments.files} remove={attachments.remove} sending={sending} progress={uploadProgress} maxSize={uploadLimit} />}
    {attachments.files.length > 0 && getUploadLimit && uploadLimit === undefined && !limitError && <p className="attachment-limit-status" role="status">Checking the server?s upload limit?</p>}
    {attachments.files.length > 0 && limitError && <p className="composer-send-error" role="alert">Could not check the server?s upload limit. <button type="button" onClick={() => setLimitRetry(value => value + 1)}>Retry</button></p>}
    {sendError && <p className="composer-send-error" role="alert">{sendError}</p>}
    {(editing || replying) && <div className="composer-message-context"><span>{editing ? "Editing message" : `Replying to ${replying?.sender.displayName}`}<small>{(editing ?? replying)?.body}</small></span><button type="button" className="icon-button" aria-label="Cancel message action" disabled={sending} onClick={onCancelAction}>×</button></div>}
    <form ref={form} className="composer composer--gifs composer--emojis" onSubmit={(event) => void submit(event)}>
      <input ref={fileInput} type="file" multiple hidden aria-label="Choose files to attach" disabled={sending || Boolean(editing) || !onSendAttachment} onChange={event => { attachments.add(Array.from(event.currentTarget.files ?? [])); event.currentTarget.value = ""; }} />
      <button type="button" className="composer__add" aria-label="Attach files" title="Attach files" disabled={sending || Boolean(editing) || !onSendAttachment} onClick={() => fileInput.current?.click()}>
        <PlusIcon />
      </button>
      <div className="composer__input">
      {mentionSuggestions.length > 0 && <div className="emoji-suggestions mention-suggestions" role="listbox" id={suggestionId} aria-label="Room members" ref={suggestionList}>
        {mentionSuggestions.map((member, index) => <button type="button" role="option" id={`${suggestionId}-${index}`} key={member.id} aria-selected={index === activeEmoji} onMouseDown={event => event.preventDefault()} onMouseEnter={() => setActiveEmoji(index)} onClick={() => pickMention(member)}>
          <Avatar name={member.displayName} url={member.avatarUrl} size="small" /><strong>@{member.displayName}</strong><small>{member.id}</small>
        </button>)}<footer>↑ ↓ to choose · Enter / Tab to mention · Esc to close</footer>
      </div>}
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
        aria-expanded={suggestionCount > 0}
        aria-controls={suggestionCount ? suggestionId : undefined}
        aria-activedescendant={suggestionCount ? `${suggestionId}-${Math.min(activeEmoji, suggestionCount - 1)}` : undefined}
        rows={1}
        disabled={sending}
      />
      </div>
      <span className="composer__hint">{prefs.sendWithEnter ? "Shift + Enter for a new line" : "Ctrl + Enter to send"}</span>
      <button type="button" className="composer__emoji icon-button" aria-label="Emoji auswählen" title="Emojis" aria-haspopup="dialog" aria-expanded={emojiOpen} disabled={sending} onClick={() => setEmojiOpen(true)}><Smile /></button>
      <button type="button" className="composer__gif" aria-label="GIF suchen und senden" title="GIF suchen" aria-haspopup="dialog" aria-expanded={gifOpen} disabled={sending || Boolean(editing)} onClick={() => setGifOpen(true)}>GIF</button>
      <button className="composer__send" type="submit" disabled={(!body.trim() && (Boolean(editing) || !attachments.files.length)) || sending || attachmentsBlocked} aria-label="Send message">
        <SendIcon />
      </button>
    </form>
    {gifOpen && <GifPicker onSend={sendGif} onClose={() => setGifOpen(false)} />}
    {emojiOpen && <EmojiPicker onPick={(emoji) => pickEmoji(emoji, Boolean(token))} onClose={() => setEmojiOpen(false)} />}
    </>
  );
}

