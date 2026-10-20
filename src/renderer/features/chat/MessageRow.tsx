import { AttachmentMessage } from "./AttachmentMessage";
import type { MatrixMessage } from "../../../domain/matrix/MatrixTypes";
import { parseGifMessage } from "../../../domain/messaging/GifMessage";
import { GifMessage } from "./GifMessage";
import { MessageText } from "./MessageText";
import { Avatar } from "../../components/common/Avatar";
import { LockKeyhole as LockIcon } from "lucide-react";
import { usePreferences } from "../../hooks/usePreferences";
import { useCallback, useState } from "react";
import { MoreHorizontal, Pin, Reply, SmilePlus } from "lucide-react";
import { MessageContextMenu, type MessageAction } from "./MessageContextMenu";
import { EmojiPicker } from "./EmojiPicker";

interface MessageRowProps {
  message: MatrixMessage;
  grouped: boolean;
  onReact(key: string): void | Promise<void>;
  onAction?: (action: MessageAction) => void | Promise<void>;
  onMediaLoad?: () => void;
}

export function MessageRow({ message, grouped, onReact, onMediaLoad, onAction }: MessageRowProps) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [error, setError] = useState("");
  const closeMenu = useCallback(() => setMenu(null), []);
  const actionable = message.sendState === "sent" && !message.isRedacted && message.type !== "encrypted";
  const react = (key: string) => { setError(""); void Promise.resolve().then(() => onReact(key)).catch(cause => setError(cause instanceof Error ? cause.message : "Reaction failed.")); };
  const prefs = usePreferences();
  const timeFormatter = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", hour12: !prefs.use24HourTime });
  const timestamp = Number.isFinite(message.timestamp) ? message.timestamp : Date.now();
  const special = message.type === "encrypted" || message.type === "unsupported";
  const gif = prefs.showInlineMedia && message.type === "text" && !message.isRedacted ? parseGifMessage(message.body) : null;
  const mentioned = Boolean(message.mentionsOwnUser && !message.isRedacted);
  return (
    <article aria-label={mentioned ? "Message mentioning you" : undefined} className={`message-row ${grouped ? "is-grouped" : ""} ${message.sendState === "failed" ? "is-failed" : ""} ${mentioned ? "is-mentioned" : ""}`} onContextMenu={event => { if (actionable) { event.preventDefault(); setMenu({ x: event.clientX, y: event.clientY }); } }}>
      <div className="message-row__avatar">
        {!grouped && <Avatar name={message.sender.displayName} url={message.sender.avatarUrl} />}
        {grouped && <time>{timeFormatter.format(timestamp)}</time>}
      </div>
      <div className="message-row__content">
        {message.isPinned && <div className="message-pinned"><Pin size={12} /> Pinned message</div>}
        {!grouped && (
          <header>
            <strong>{message.sender.displayName}</strong>
            <time dateTime={new Date(timestamp).toISOString()}>
              {new Date(timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" })} at {timeFormatter.format(timestamp)}
            </time>
            {message.edited && <span>(edited)</span>}
          </header>
        )}
        {message.replyTo && <div className="reply-context">↳ Reply to {message.replyTo.slice(0, 10)}…</div>}
        {message.attachment && !message.isRedacted ? <AttachmentMessage sender={message.sender} timestamp={timestamp} attachment={message.attachment} inline={prefs.showInlineMedia} onLoad={onMediaLoad} /> : gif ? <GifMessage key={gif} url={gif} onLoad={onMediaLoad} /> : <div className={special ? "message-special" : message.type === "notice" ? "message-notice" : ""}>
          {message.type === "encrypted" && <LockIcon />}
          {message.type === "emote" && <em>* {message.sender.displayName} </em>}
          <MessageText message={message} convertEmoji={prefs.convertEmoji && (message.type === "text" || message.type === "notice" || message.type === "emote")} />
        </div>}
        {message.reactions.length > 0 && (
          <div className="reactions">
            {message.reactions.map((reaction) => (
              <button
                type="button"
                className={reaction.eventId ? "is-mine" : ""}
                aria-pressed={Boolean(reaction.eventId)}
                aria-label={`${reaction.eventId ? "Remove" : "Add"} ${reaction.key} reaction, ${reaction.count}`}
                key={reaction.key}
                onClick={() => react(reaction.key)}
                disabled={!actionable}
                title={reaction.userIds.join(", ")}
              >
                <span className="reaction-emoji">{reaction.key}</span><span className="reaction-count">{reaction.count}</span>
              </button>
            ))}
          </div>
        )}
        {message.sendState !== "sent" && (
          <span className={`send-state send-state--${message.sendState}`}>
            {message.sendState === "sending" ? "Sending…" : message.sendState}
          </span>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
      {actionable && (
        <div className="message-actions" role="toolbar" aria-label="Quick message actions">
          {[['👍', 'thumbs up'], ['🙏', 'folded hands'], ['💀', 'skull']].map(([emoji, label]) => <button type="button" className="message-actions__emoji" key={emoji} onClick={() => react(emoji)} aria-label={`React with ${label}`} title={`React with ${emoji}`}>{emoji}</button>)}
          <span className="message-actions__divider" aria-hidden="true" />
          <button type="button" aria-label="Choose reaction emoji" title="Add reaction" onClick={() => setEmojiOpen(true)}><SmilePlus size={20} /></button>
          <button type="button" aria-label="Reply" title="Reply" onClick={() => { void Promise.resolve().then(() => onAction?.("reply")).catch(cause => setError(cause instanceof Error ? cause.message : "Reply failed.")); }}><Reply size={20} /></button>
          <button type="button" aria-label="Message actions" aria-haspopup="menu" aria-expanded={Boolean(menu)} onClick={event => { const rect = event.currentTarget.getBoundingClientRect(); setMenu({ x: rect.right, y: rect.bottom }); }}><MoreHorizontal size={18} /></button>
        </div>
      )}
      {menu && <MessageContextMenu message={message} position={menu} onClose={closeMenu} onReact={onReact} onEmoji={() => { closeMenu(); setEmojiOpen(true); }} onAction={action => onAction?.(action)} />}
      {emojiOpen && <EmojiPicker onPick={react} onClose={() => setEmojiOpen(false)} />}
    </article>
  );
}


