import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { MatrixMessage } from "../../../domain/matrix/MatrixTypes";
import { MessageText } from "./MessageText";
import { isEmojiOnly } from "../../../domain/messaging/EmojiOnly";

const message: MatrixMessage = {
  id: "$test", roomId: "!room:example.org", sender: { id: "@alice:example.org", displayName: "Alice", avatarUrl: null },
  timestamp: 1, type: "text", body: "", edited: false, replyTo: null, reactions: [], sendState: "sent", isOwn: false, isRedacted: false,
};
const render = (body: string, changes: Partial<MatrixMessage> = {}, convertEmoji = true) => renderToStaticMarkup(<MessageText message={{ ...message, body, ...changes }} convertEmoji={convertEmoji} />);

describe("message Markdown", () => {
  it("renders headings, lists, emphasis, and nested formatting", () => {
    const html = render("# Header\n\n## Smaller Header\n\n- List\n- **bold** and _italic_\n\n1. Numbered");
    expect(html).toContain("<h1>Header</h1>");
    expect(html).toContain("<h2>Smaller Header</h2>");
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>List</li>");
    expect(html).toContain("<strong>bold</strong> and <em>italic</em>");
    expect(html).toContain("<ol>");
  });
  it("keeps inline and fenced code literal, including shortcodes and mentions", () => {
    const html = render("`:smile: **literal**`\n\n```js\n:heart: @alice:example.org\n```", { mentions: [message.sender] });
    expect(html).toContain("<code>:smile: **literal**</code>");
    expect(html).toContain('<pre><code class="language-js">:heart: @alice:example.org');
    expect(html).not.toContain("message-mention");
  });
  it("highlights mentions inside formatting without interpreting display names as Markdown", () => {
    const html = render("**Hello @alice:example.org** :smile:", { mentions: [{ ...message.sender, displayName: "**Alice** <script>" }] });
    expect(html).toContain('class="message-mention"');
    expect(html).toContain("@**Alice** &lt;script&gt;");
    expect(html).toContain("😄");
  });
  it("escapes HTML, blocks dangerous links, and respects escaped Markdown", () => {
    const html = render('<script>alert(1)</script>\n\n[bad](javascript:alert)\n\n\\*literal\\*');
    expect(html).not.toContain("<script>");
    expect(html).not.toContain('href="javascript:');
    expect(html).toContain("*literal*");
    expect(html).not.toContain("<em>literal</em>");
  });
  it("enlarges only emoji messages and respects shortcode preferences", () => {
    expect(render("👨‍👩‍👧‍👦 👍🏽 🇩🇪 1️⃣")).toContain("message-body-text--emoji-only");
    expect(render(":smile: :heart:")).toContain("message-body-text--emoji-only");
    expect(render(":smile:", {}, false)).not.toContain("message-body-text--emoji-only");
    expect(render("hi 😀")).not.toContain("message-body-text--emoji-only");
    expect(render("`😀`")).not.toContain("message-body-text--emoji-only");
    expect(render("😀", { type: "encrypted" })).not.toContain("message-body-text--emoji-only");
  });
});

describe("emoji-only detection", () => {
  it.each(["😀", " ❤️ \n🔥", "👍🏿", "👩🏽‍💻", "🇺🇸", "#️⃣", "🏴\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}"])("recognizes %s", text => expect(isEmojiOnly(text)).toBe(true));
  it.each(["", " ", "1", "#", "*", "hello 😀", "😀!", "🏽", "🇩", "\u200D", "1\uFE0F"])("rejects %s", text => expect(isEmojiOnly(text)).toBe(false));
});

describe("clickable message links", () => {
  it("links bare URLs and domains while leaving trailing punctuation outside", () => {
    const html = render("See https://example.org/path?q=1&x=2, www.example.com! Also example.org.");
    expect(html).toContain('href="https://example.org/path?q=1&amp;x=2"');
    expect(html).toContain('href="https://www.example.com/"');
    expect(html).toContain('href="https://example.org/"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('</a>,');
    expect(html).toContain('</a>!');
    expect(html.match(/<a /g)).toHaveLength(3);
  });
  it("keeps balanced URL parentheses and email destinations", () => {
    const html = render("(https://example.org/wiki/Frog_(animal)). alice@example.org");
    expect(html).toContain('href="https://example.org/wiki/Frog_(animal)"');
    expect(html).toContain('href="mailto:alice@example.org"');
  });
  it("preserves code, existing links, mentions, and literal emoji shortcodes in URLs", () => {
    const html = render("**https://example.org/:smile:** @alice:example.org `https://code.example` [site](https://example.com) [www.example.org][ref]\n\n[ref]: https://example.net", { mentions: [message.sender] });
    expect(html).toContain('href="https://example.org/:smile:"');
    expect(html).toContain('<code>https://code.example</code>');
    expect(html).toContain('class="message-mention"');
    expect(html.match(/<a /g)).toHaveLength(3);
    expect(html).not.toContain('<a href="https://www.example.org/"');
  });
  it("keeps disallowed Markdown destinations non-clickable", () => {
    const html = render("[script](javascript:alert) [file](file:///private) [login](https://user:pass@example.com) [data](data:text/html,test)");
    expect(html).not.toContain('<a ');
  });
});
