import type { MatrixMessage } from "../../../domain/matrix/MatrixTypes";
import { Avatar } from "../../components/common/Avatar";
import { LockKeyhole as LockIcon } from "lucide-react";

interface MessageRowProps {
  message: MatrixMessage;
  grouped: boolean;
  onReact(key: string): void;
}

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
});

export function MessageRow({ message, grouped, onReact }: MessageRowProps) {
  const timestamp = Number.isFinite(message.timestamp) ? message.timestamp : Date.now();
  const special = message.type === "encrypted" || message.type === "unsupported";
  return (
    <article className={`message-row ${grouped ? "is-grouped" : ""} ${message.sendState === "failed" ? "is-failed" : ""}`}>
      <div className="message-row__avatar">
        {!grouped && <Avatar name={message.sender.displayName} url={message.sender.avatarUrl} />}
        {grouped && <time>{timeFormatter.format(timestamp)}</time>}
      </div>
      <div className="message-row__content">
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
        <p className={special ? "message-special" : message.type === "notice" ? "message-notice" : ""}>
          {message.type === "encrypted" && <LockIcon />}
          {message.type === "emote" && <em>* {message.sender.displayName} </em>}
          {message.body}
        </p>
        {message.reactions.length > 0 && (
          <div className="reactions">
            {message.reactions.map((reaction) => (
              <button
                type="button"
                className={reaction.eventId ? "is-mine" : ""}
                key={reaction.key}
                onClick={() => onReact(reaction.key)}
                title={reaction.userIds.join(", ")}
              >
                {reaction.key} <span>{reaction.count}</span>
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
      {message.type === "text" && message.sendState === "sent" && (
        <div className="message-actions">
          <button type="button" onClick={() => onReact("👍")} aria-label="React with thumbs up">＋ 👍</button>
        </div>
      )}
    </article>
  );
}


