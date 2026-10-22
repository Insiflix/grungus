import { LinkifyIt } from "linkify-it";
import { secureMessageUrl } from "../../../../electron/shared/urls";
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

const linkify = new LinkifyIt({ fuzzyLink: true }).add("ftp:", null);
const messageHref = (href: string | undefined) => {
  try { return href ? secureMessageUrl(href) : undefined; }
  catch { return undefined; }
};

export function MessageText({ message, convertEmoji }: { message: MatrixMessage; convertEmoji: boolean }) {
  const blocked = useBlockedUsers();
  const plugins = useMemo(() => [() => (tree: MarkdownNode) => {
    const text = (value: string) => convertEmoji ? replaceEmojiShortcodes(value) : value;
    const plain = (value: string): MarkdownNode[] => {
      const parts: MarkdownNode[] = [];
      let cursor = 0;
      for (const match of linkify.match(value) ?? []) {
        const href = messageHref(match.schema === "" || match.schema === "//" ? `https://${match.raw.replace(/^\/\//, "")}` : match.url);
        if (!href) continue;
        parts.push({ type: "text", value: text(value.slice(cursor, match.index)) });
        parts.push({ type: "link", url: href, children: [{ type: "text", value: match.raw }] });
        cursor = match.lastIndex;
      }
      parts.push({ type: "text", value: text(value.slice(cursor)) });
      return parts;
    };
    const visit = (node: MarkdownNode) => {
      if (!node.children || ["code", "inlineCode", "link", "linkReference", "image", "imageReference", "definition", "html"].includes(node.type)) return;
      node.children = node.children.flatMap(child => {
        if (child.type !== "text") { visit(child); return [child]; }
        const value = child.value ?? "";
        const parts: MarkdownNode[] = [];
        let cursor = 0;
        for (const mention of mentionOccurrences(value, message.mentions ?? [])) {
          parts.push(...plain(value.slice(cursor, mention.start)));
          const ignored = blocked.has(mention.user.id);
          parts.push({ type: "link", url: "#", data: { hName: "span", hProperties: { className: `message-mention${ignored ? " message-mention--blocked" : ""}`, "data-tooltip": `${mention.user.id}${ignored ? " · Blocked user" : ""}` } }, children: [{ type: "text", value: `@${mention.user.displayName}${ignored ? " · Blocked" : ""}` }] });
          cursor = mention.end;
        }
        parts.push(...plain(value.slice(cursor)));
        return parts;
      });
    };
    visit(tree);
  }], [convertEmoji, message.mentions, blocked]);
  const normal = !message.isRedacted && ["text", "notice", "emote"].includes(message.type);
  const large = normal && isEmojiOnly(convertEmoji ? replaceEmojiShortcodes(message.body) : message.body);
  return <div className={`message-body-text${large ? " message-body-text--emoji-only" : ""}`}>
    {normal ? <Markdown remarkPlugins={plugins} components={{
      a: ({ children, href }) => {
        const url = messageHref(href);
        return url ? <a href={url} target="_blank" rel="noopener noreferrer">{children}</a> : <span>{children}</span>;
      },
      img: ({ alt, src }) => {
        const url = messageHref(typeof src === "string" ? src : undefined);
        return url ? <a href={url} target="_blank" rel="noopener noreferrer">{alt || "Image"}</a> : <span>{alt || "Image"}</span>;
      },
    }}>{message.body}</Markdown> : message.body}
  </div>;
}
