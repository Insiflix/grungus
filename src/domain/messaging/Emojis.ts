import rawData from "@emoji-mart/data/sets/15/native.json";
import type { Emoji, EmojiMartData } from "@emoji-mart/data";

const data = rawData as EmojiMartData;
const germanAliases: Record<string, string> = {
  lachen: "joy", lächeln: "smile", herz: "heart", liebe: "heart", frosch: "frog", kröte: "frog",
  feuer: "fire", daumen_hoch: "+1", daumen_runter: "-1", traurig: "cry", weinen: "sob",
  glücklich: "smiley", party: "tada", feiern: "tada", winken: "wave", sonne: "sunny",
  kuss: "kissing_heart", hund: "dog", katze: "cat", baum: "evergreen_tree", kaffee: "coffee",
};
const aliases = { ...data.aliases, ...germanAliases };
const names = new Map<string, string[]>();
Object.entries(aliases).forEach(([alias, id]) => { names.set(id, [...(names.get(id) ?? []), alias]); });
const emojiList = Object.values(data.emojis);
const searchText = new Map(emojiList.map((emoji) => [emoji.id, [emoji.id, emoji.name, ...emoji.keywords, ...(names.get(emoji.id) ?? [])].join(" ").toLowerCase()]));

export const emojiCategories = data.categories;
export const commonEmojiIds = ["smile", "joy", "rofl", "heart", "+1", "-1", "fire", "tada", "eyes", "thinking_face", "sob", "laughing", "wave", "frog", "100", "rocket", "sparkles", "sunglasses", "heart_eyes", "blush", "pray", "clap", "muscle", "skull", "coffee", "dog", "cat", "sunny", "rainbow", "white_check_mark", "x", "ok_hand"];
export const getEmoji = (id: string): Emoji | undefined => data.emojis[aliases[id.toLowerCase()] ?? id.toLowerCase()];
export const nativeEmoji = (emoji: Emoji, skin = 0): string => (emoji.skins[skin] ?? emoji.skins[0]).native;

export function searchEmojis(query: string, limit = 8): Emoji[] {
  const term = query.trim().replace(/^:|:$/g, "").toLowerCase();
  if (!term) return commonEmojiIds.map(getEmoji).filter((emoji): emoji is Emoji => Boolean(emoji)).slice(0, limit);
  const tokens = term.split(/\s+/);
  return emojiList.filter((emoji) => tokens.every((token) => searchText.get(emoji.id)!.includes(token)))
    .map((emoji) => ({ emoji, rank: emoji.id === term || aliases[term] === emoji.id ? 0 : emoji.id.startsWith(term) || (names.get(emoji.id) ?? []).some((name) => name.startsWith(term)) ? 1 : 2 }))
    .sort((a, b) => a.rank - b.rank || a.emoji.id.localeCompare(b.emoji.id)).slice(0, limit).map(({ emoji }) => emoji);
}

/** Preserve code and links, including /gif URLs. Unknown shortcodes remain text. */
export function replaceEmojiShortcodes(text: string): string {
  return text.replace(/```[\s\S]*?```|`[^`\n]*`|https?:\/\/[^\s]+|:([\p{L}0-9_+-]+):(?::skin-tone-([2-6]):)?/giu,
    (match, id?: string, tone?: string) => {
      if (!id) return match;
      const emoji = getEmoji(id);
      return emoji ? nativeEmoji(emoji, tone ? Number(tone) - 1 : 0) : match;
    });
}

export interface EmojiQuery { start: number; end: number; query: string }
export function emojiQueryAt(text: string, caret: number): EmojiQuery | null {
  const prefix = text.slice(0, caret);
  const match = /(?:^|[\s([{])(:([\p{L}0-9_+-]{1,40}))$/iu.exec(prefix);
  if (!match) return null;
  // Suggestions should not interrupt inline or fenced code.
  if ((prefix.match(/`/g)?.length ?? 0) % 2 !== 0) return null;
  return { start: caret - match[1].length, end: caret, query: match[2] };
}

export function insertEmojiAt(text: string, start: number, end: number, emoji: string): { text: string; caret: number } {
  return { text: text.slice(0, start) + emoji + text.slice(end), caret: start + emoji.length };
}
