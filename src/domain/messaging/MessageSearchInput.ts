import type { MessageSearchQuery } from "./MessageSearch";

export function activeSearchFilter(input: string, caret: number) {
  const pattern = /(?<!\S)(from|in|has|after|before):("[^"]*"?|[^\s]*)/gi;
  for (const match of input.matchAll(pattern)) {
    const start = match.index, end = start + match[0].length;
    if (caret >= start + match[1].length + 1 && caret <= end) return {key:match[1].toLowerCase(),prefix:match[2].replace(/^"|"$/g,""),start,end};
  }
  return null;
}

export function parseMessageSearch(input: string) {
  const filters: { sender?: string; channel?: string; media?: MessageSearchQuery["media"]; after?: string; before?: string } = {};
  const text = input.replace(/(?<!\S)(from|in|has|after|before):(?:"([^"]*)"|(\S+))/gi, (_match, name: string, quoted: string | undefined, plain: string | undefined) => {
    const value = quoted ?? plain ?? "";
    if (!value.trim()) throw new Error("Add a value after the search filter.");
    switch (name.toLowerCase()) {
      case "from": filters.sender = value; break;
      case "in": filters.channel = value; break;
      case "has": {
        const media = value.toLowerCase();
        if (!["any", "media", "image", "video", "audio", "file", "link"].includes(media)) throw new Error("Use has:image, video, audio, file, link, or media.");
        filters.media = media as MessageSearchQuery["media"]; break;
      }
      case "after": filters.after = value; break;
      case "before": filters.before = value; break;
    }
    return "";
  }).replace(/\s+/g, " ").trim();
  if (/(?<!\S)(from|in|has|after|before):\s*$/i.test(text)) throw new Error("Add a value after the search filter.");
  return { text, ...filters };
}
