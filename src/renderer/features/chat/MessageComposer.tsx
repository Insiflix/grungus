import { PollDialog } from "./PollDialog";
import { ThemedPopover } from "../../components/common/ThemedPopover";
import type { PollInput } from "../../../domain/messaging/Polls";
import { AttachmentDraft, AttachmentDropOverlay, useAttachmentDraft } from "./AttachmentDraft";
import { useEffect, useLayoutEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
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
import { roomDrafts, useRoomDraft } from "./RoomDrafts";
import { PendingMessageError } from "../../../domain/messaging/PendingMessageError";

interface MessageComposerProps {
  draftKey?: string;
  onSendComplete?: () => void;
  roomName: string;
  onSend(body: string): Promise<void>;
  onSendPoll?: (input: PollInput) => Promise<unknown>;
  onTyping(typing: boolean): void;
  getUploadLimit?: () => Promise<number | null>;
  onSendAttachment?: (file: File, onProgress: (percent: number) => void) => Promise<void>;
  editing?: MatrixMessage | null;
  replying?: MatrixMessage | null;
  onCancelAction?: () => void;
  members?: MatrixRoomMember[];
}

export function MessageComposer({ roomName, draftKey, onSendComplete, onSend, onSendPoll, onTyping, onSendAttachment, getUploadLimit, editing, replying, onCancelAction, members = [] }: MessageComposerProps) {
  const savedDraft = useRoomDraft(draftKey);
  const prefs = usePreferences();
  const [body, setBody] = useState(() => savedDraft.body);
  const [sending, setSending] = useState(() => Boolean(savedDraft.sending));
  useEffect(() => { if (draftKey) setSending(Boolean(savedDraft.sending)); }, [draftKey, savedDraft.sending]);
  const form = useRef<HTMLFormElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const attachments = useAttachmentDraft(form, Boolean(onSendAttachment) && !sending && !editing, draftKey);
  useEffect(() => { if (draftKey && !editing && !sending) setBody(savedDraft.body); }, [draftKey, savedDraft.body, editing, sending]);
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
  const [retryable, setRetryable] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [pollOpen, setPollOpen] = useState(false);
  const addButton = useRef<HTMLButtonElement>(null);
  const [gifOpen, setGifOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [caret, setCaret] = useState(0);
  const [activeEmoji, setActiveEmoji] = useState(0);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const selection = useRef({ start: 0, end: 0 });
  const restoredDraft = useRef<{ key: string; body: string } | null>(null);
  const locallyEdited = useRef(false);
  const restoringSelection = useRef(false);
  useLayoutEffect(() => {
    if (editing) { restoredDraft.current = null; return; }
    if (!draftKey || sending || !savedDraft.hydrated || body !== savedDraft.body || !textarea.current) return;
    if (restoredDraft.current?.key === draftKey && restoredDraft.current.body === body) return;
    const start = Math.max(0, Math.min(savedDraft.selection?.start ?? body.length, body.length));
    const end = Math.max(start, Math.min(savedDraft.selection?.end ?? body.length, body.length));
    const direction = savedDraft.selection?.direction ?? "none";
    restoredDraft.current = { key: draftKey, body };
    selection.current = { start, end }; setCaret(direction === "backward" ? start : end);
    restoringSelection.current = true;
    textarea.current.focus({ preventScroll: true });
    textarea.current.setSelectionRange(start, end, direction);
    restoringSelection.current = false;
  }, [draftKey, savedDraft.hydrated, savedDraft.body, savedDraft.selection, body, editing, sending]);
  const rememberSelection = (node: HTMLTextAreaElement) => {
    if (restoringSelection.current) return;
    const start = node.selectionStart, end = node.selectionEnd;
    const direction = node.selectionDirection;
    selection.current = { start, end }; setCaret(direction === "backward" ? start : end);
    if (!editing && !sending && (savedDraft.hydrated || locallyEdited.current)) roomDrafts.patch(draftKey, { selection: { start, end, direction } });
  };
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
    locallyEdited.current = true;
    if (draftKey) restoredDraft.current = { key: draftKey, body: value };
    setBody(value);
    if (!editing) roomDrafts.patch(draftKey, { body: value });
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
    if ((!message && !pendingFiles.length) || sendLock.current || savedDraft.sending) return;
    if (attachmentsBlocked) return;
    let messageSent = !message;
    let activeAttachment: string | undefined;
    sendLock.current = true;
    setSendError("");
    setRetryable(false);
    setBody("");
    setCaret(0); selection.current = { start: 0, end: 0 };
    setSending(true);
    roomDrafts.patch(draftKey, { sending: true });
    typingNotifications.current?.stop();
    try {
      if (message) { await onSend(message); messageSent = true; }
      if (!editing && messageSent) roomDrafts.patch(draftKey, { body: "" });
      for (const item of pendingFiles) {
        activeAttachment = item.id;
        if (!onSendAttachment) throw new Error("File uploads are unavailable.");
        await onSendAttachment(item.file, percent => setUploadProgress({ id: item.id, percent }));
        attachments.remove(item.id);
      }
      onSendComplete?.();
    } catch (error) {
      const pending = error instanceof PendingMessageError;
      if (pending && activeAttachment) attachments.remove(activeAttachment);
      if (pending && !messageSent) { messageSent = true; roomDrafts.patch(draftKey, { body: "" }); }
      setRetryable(!pending);
      setSendError(pending ? `${error.message} Use Retry or Cancel on the failed message.` : error instanceof Error ? error.message : "Message could not be saved. Please try again.");
      if (!messageSent) { setBody(message);
      setCaret(message.length); selection.current = { start: message.length, end: message.length }; }
    } finally {
      sendLock.current = false;
      setUploadProgress(null);
      setSending(false);
      roomDrafts.patch(draftKey, { sending: false });
    }
  };

  const sendGif = async (url: string) => {
    if (sendLock.current || savedDraft.sending) throw new Error("Eine Nachricht wird bereits gesendet.");
    const message = createGifMessage(url);
    sendLock.current = true; setSending(true); typingNotifications.current?.stop();
    roomDrafts.patch(draftKey, { sending: true });
    try { await onSend(message); onSendComplete?.(); }
    catch (cause) {
      if (!(cause instanceof PendingMessageError)) throw cause;
      setGifOpen(false); setRetryable(false); setSendError(`${cause.message} Use Retry or Cancel on the failed message.`);
    }
    finally { sendLock.current = false; setSending(false); roomDrafts.patch(draftKey, { sending: false }); }
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
    {sendError && <div className="composer-send-error" role="alert">{sendError}{retryable && <><button type="button" disabled={sending || attachmentsBlocked} onClick={() => void submit()}>Retry send</button><button type="button" disabled={sending} onClick={() => { setSendError(""); setRetryable(false); }}>Cancel retry</button></>}</div>}
    {savedDraft.storageError && <p className="attachment-limit-status" role="status">{savedDraft.storageError}</p>}
    {(editing || replying) && <div className="composer-message-context"><span>{editing ? "Editing message" : `Replying to ${replying?.sender.displayName}`}<small>{(editing ?? replying)?.body}</small></span><button type="button" className="icon-button" aria-label="Cancel message action" disabled={sending} onClick={onCancelAction}>×</button></div>}
    <form ref={form} className="composer composer--gifs composer--emojis" onSubmit={(event) => void submit(event)}>
      <input ref={fileInput} type="file" multiple hidden aria-label="Choose files to attach" disabled={sending || Boolean(editing) || !onSendAttachment} onChange={event => { attachments.add(Array.from(event.currentTarget.files ?? [])); event.currentTarget.value = ""; }} />
      <button ref={addButton} type="button" className="composer__add" aria-label={onSendPoll ? "Add attachment or poll" : "Attach files"} data-tooltip={onSendPoll ? "Add attachment or poll" : "Attach files"} aria-haspopup={onSendPoll ? "dialog" : undefined} aria-expanded={onSendPoll ? addOpen : undefined} disabled={sending || Boolean(editing) || (!onSendAttachment && !onSendPoll)} onClick={() => onSendPoll ? setAddOpen(value => !value) : fileInput.current?.click()}>
        <PlusIcon />
      </button>
      {addOpen && <ThemedPopover anchor={addButton} onClose={() => setAddOpen(false)} role="dialog" label="Add to message" className="composer-add-menu" width={210}><button type="button" disabled={!onSendAttachment} onClick={() => { setAddOpen(false); fileInput.current?.click(); }}>Attach files</button><button type="button" onClick={() => { setAddOpen(false); setPollOpen(true); }}>Create poll</button></ThemedPopover>}
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
        onChange={(event) => { updateBody(event.target.value); rememberSelection(event.currentTarget); setActiveEmoji(0); setDismissed(null); }}
        onSelect={event => rememberSelection(event.currentTarget)}
        onBlur={event => rememberSelection(event.currentTarget)}
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
      <button type="button" className="composer__emoji icon-button" aria-label="Emoji auswählen" data-tooltip="Emojis" aria-haspopup="dialog" aria-expanded={emojiOpen} disabled={sending} onClick={() => setEmojiOpen(true)}><Smile /></button>
      <button type="button" className="composer__gif" aria-label="GIF suchen und senden" data-tooltip="GIF suchen" aria-haspopup="dialog" aria-expanded={gifOpen} disabled={sending || Boolean(editing)} onClick={() => setGifOpen(true)}>GIF</button>
      <button className="composer__send" type="submit" disabled={(!body.trim() && (Boolean(editing) || !attachments.files.length)) || sending || attachmentsBlocked} aria-label="Send message">
        <SendIcon />
      </button>
    </form>
    {pollOpen && onSendPoll && <PollDialog onSend={async input => { await onSendPoll(input); }} onClose={() => { setPollOpen(false); addButton.current?.focus(); }} />}
    {gifOpen && <GifPicker onSend={sendGif} onClose={() => setGifOpen(false)} />}
    {emojiOpen && <EmojiPicker onPick={(emoji) => pickEmoji(emoji, Boolean(token))} onClose={() => setEmojiOpen(false)} />}
    </>
  );
}

