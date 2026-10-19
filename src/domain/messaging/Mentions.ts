import type { MatrixUser } from "../matrix/MatrixTypes";

export interface MentionQuery { start: number; end: number; query: string }
export interface MentionOccurrence { start: number; end: number; user: MatrixUser }

export function mentionQueryAt(text: string, caret: number): MentionQuery | null {
  const prefix = text.slice(0, caret);
  if ((prefix.match(/```/g)?.length ?? 0) % 2) return null;
  if ((prefix.replace(/```[\s\S]*?```/g, "").match(/`/g)?.length ?? 0) % 2) return null;
  const match = /(?:^|[\s([{])(@([^\s@]*))$/u.exec(prefix);
  return match ? { start: caret - match[1].length, end: caret + (/^[^\s@()[\]{},!?;]*/u.exec(text.slice(caret))?.[0].length ?? 0), query: match[2] } : null;
}

export function searchMentionMembers<T extends MatrixUser>(members: T[], query: string): T[] {
  const term = query.toLocaleLowerCase();
  return members.filter(member => `${member.displayName} ${member.id}`.toLocaleLowerCase().includes(term))
    .sort((a, b) => Number(b.displayName.toLocaleLowerCase().startsWith(term)) - Number(a.displayName.toLocaleLowerCase().startsWith(term)) || a.displayName.localeCompare(b.displayName))
    .slice(0, 8);
}

/** Only exact Matrix IDs outside code and URLs become intentional mentions. */
export function mentionOccurrences(text: string, members: MatrixUser[]): MentionOccurrence[] {
  const users = new Map(members.map(member => [member.id, member]));
  const occurrences: MentionOccurrence[] = [];
  const tokens = /```[\s\S]*?(?:```|$)|`[^`\n]*(?:`|$)|https?:\/\/[^\s]+|@[^\s@<>()[\]`]+/gu;
  for (const match of text.matchAll(tokens)) {
    if (!match[0].startsWith("@")) continue;
    const id = match[0].replace(/[.,!?;]+$/, "");
    const user = users.get(id);
    const before = text[match.index - 1];
    if (user && (!before || /[\s([{]/u.test(before))) occurrences.push({ start: match.index, end: match.index + id.length, user });
  }
  return occurrences;
}

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);

export function createMentionContent(body: string, members: MatrixUser[]) {
  const occurrences = mentionOccurrences(body, members);
  const userIds = [...new Set(occurrences.map(mention => mention.user.id))];
  let cursor = 0;
  let html = "";
  for (const mention of occurrences) {
    html += escapeHtml(body.slice(cursor, mention.start));
    html += `<a href="https://matrix.to/#/${encodeURIComponent(mention.user.id)}">@${escapeHtml(mention.user.displayName)}</a>`;
    cursor = mention.end;
  }
  html += escapeHtml(body.slice(cursor));
  return {
    "m.mentions": { user_ids: userIds },
    ...(occurrences.length ? { format: "org.matrix.custom.html" as const, formatted_body: html.replace(/\n/g, "<br>") } : {}),
  };
}
