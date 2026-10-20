/** Match whole emoji sequences, without treating bare digits or modifiers as emoji. */
export function isEmojiOnly(text: string): boolean {
  const compact = text.replace(/\s/gu, "");
  return compact.length > 0 && /^(?:(?:\p{Regional_Indicator}{2})|(?:[#*0-9]\uFE0F?\u20E3)|(?:\p{Extended_Pictographic}\uFE0F?\p{Emoji_Modifier}?(?:[\u{E0020}-\u{E007E}]+\u{E007F})?(?:\u200D\p{Extended_Pictographic}\uFE0F?\p{Emoji_Modifier}?)*))+$/u.test(compact);
}
