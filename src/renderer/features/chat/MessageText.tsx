import type { ReactNode } from "react";
import type { MatrixMessage } from "../../../domain/matrix/MatrixTypes";
import { mentionOccurrences } from "../../../domain/messaging/Mentions";
import { replaceEmojiShortcodes } from "../../../domain/messaging/Emojis";

export function MessageText({ message, convertEmoji }: { message: MatrixMessage; convertEmoji: boolean }) {
  const parts: ReactNode[] = [];
  let cursor = 0;
  const text = (value: string) => convertEmoji ? replaceEmojiShortcodes(value) : value;
  for (const mention of mentionOccurrences(message.body, message.mentions ?? [])) {
    parts.push(text(message.body.slice(cursor, mention.start)));
    parts.push(<span className="message-mention" key={mention.start} title={mention.user.id}>@{mention.user.displayName}</span>);
    cursor = mention.end;
  }
  parts.push(text(message.body.slice(cursor)));
  return <span className="message-body-text">{parts}</span>;
}
