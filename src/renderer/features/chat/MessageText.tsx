import { useMemo } from "react";
import Markdown from "react-markdown";
import type { MatrixMessage } from "../../../domain/matrix/MatrixTypes";
import { mentionOccurrences } from "../../../domain/messaging/Mentions";
import { replaceEmojiShortcodes } from "../../../domain/messaging/Emojis";
import { isEmojiOnly } from "../../../domain/messaging/EmojiOnly";
import { useBlockedUsers } from "../../hooks/useBlockedUsers";

interface MarkdownNode {
  type: string;
  value?: string;
  children?: MarkdownNode[];
  url?: string;
  data?: { hName: string; hProperties: Record<string, string> };
}

export function MessageText({ message, convertEmoji }: { message: MatrixMessage; convertEmoji: boolean }) {
  const blocked = useBlockedUsers();
  const plugins = useMemo(() => [() => (tree: MarkdownNode) => {
    const text = (value: string) => convertEmoji ? replaceEmojiShortcodes(value) : value;
    const visit = (node: MarkdownNode) => {
      if (!node.children || ["code", "inlineCode", "link", "image", "html"].includes(node.type)) return;
      node.children = node.children.flatMap(child => {
        if (child.type !== "text") { visit(child); return [child]; }
        const value = child.value ?? "";
        const parts: MarkdownNode[] = [];
        let cursor = 0;
        for (const mention of mentionOccurrences(value, message.mentions ?? [])) {
          parts.push({ type: "text", value: text(value.slice(cursor, mention.start)) });
          const ignored = blocked.has(mention.user.id);
          parts.push({ type: "link", url: "#", data: { hName: "span", hProperties: { className: `message-mention${ignored ? " message-mention--blocked" : ""}`, "data-tooltip": `${mention.user.id}${ignored ? " · Blocked user" : ""}` } }, children: [{ type: "text", value: `@${mention.user.displayName}${ignored ? " · Blocked" : ""}` }] });
          cursor = mention.end;
        }
        parts.push({ type: "text", value: text(value.slice(cursor)) });
        return parts;
      });
    };
    visit(tree);
  }], [convertEmoji, message.mentions, blocked]);
  const normal = !message.isRedacted && ["text", "notice", "emote"].includes(message.type);
  const large = normal && isEmojiOnly(convertEmoji ? replaceEmojiShortcodes(message.body) : message.body);
  return <div className={`message-body-text${large ? " message-body-text--emoji-only" : ""}`}>
    {normal ? <Markdown remarkPlugins={plugins} components={{
      a: ({ children, href }) => <a href={href} target="_blank" rel="noreferrer">{children}</a>,
      img: ({ alt, src }) => <a href={typeof src === "string" ? src : undefined} target="_blank" rel="noreferrer">{alt || "Image"}</a>,
    }}>{message.body}</Markdown> : message.body}
  </div>;
}
