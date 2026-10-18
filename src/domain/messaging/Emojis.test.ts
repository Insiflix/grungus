import { describe, expect, it } from "vitest";
import { emojiQueryAt, getEmoji, insertEmojiAt, nativeEmoji, replaceEmojiShortcodes, searchEmojis } from "./Emojis";

describe("emoji shortcodes and autocomplete", () => {
  it("converts standard aliases, German aliases, and skin tones", () => {
    expect(replaceEmojiShortcodes("Hi :smile: :herz: :frosch: :+1::skin-tone-3:")).toBe("Hi 😄 ❤️ 🐸 👍🏼");
  });
  it("preserves unknown names, inline code, fenced code, URLs and GIF commands", () => {
    const text = ":unknown_emoji: `:smile:` ```\n:heart:\n``` https://example.org/:smile: /gif https://example.org/:heart:.gif";
    expect(replaceEmojiShortcodes(text)).toBe(text);
  });
  it("finds and ranks exact shortcode aliases before substring matches", () => {
    expect(searchEmojis("smile")[0].id).toBe("smile");
    expect(searchEmojis("daumen_hoch")[0].id).toBe("+1");
    expect(searchEmojis("frog").some((emoji) => emoji.id === "frog")).toBe(true);
    expect(searchEmojis("no_such_emoji_999")).toEqual([]);
  });
  it("recognizes a partial shortcode at the caret even in the middle of a draft", () => {
    expect(emojiQueryAt("Hi :smi there", 7)).toEqual({ start: 3, end: 7, query: "smi" });
    expect(emojiQueryAt(":fro", 4)).toEqual({ start: 0, end: 4, query: "fro" });
  });
  it.each(["https://example.org/:smi", "12:30", "`:smi", "```\n:smi", ":smile:", "plain text"])("does not open completion inside links, code or completed tokens: %s", (text) => {
    expect(emojiQueryAt(text, text.length)).toBeNull();
  });
  it("replaces only the requested range and positions the caret after the Unicode emoji", () => {
    expect(insertEmojiAt("Hi :smi there", 3, 7, "😄")).toEqual({ text: "Hi 😄 there", caret: 5 });
    expect(insertEmojiAt("Hello world", 6, 11, "🐸")).toEqual({ text: "Hello 🐸", caret: 8 });
  });
  it("uses native emoji and supports available skin variants", () => {
    expect(nativeEmoji(getEmoji("+1")!, 5)).toBe("👍🏿");
    expect(nativeEmoji(getEmoji("frog")!, 5)).toBe("🐸");
  });
});
