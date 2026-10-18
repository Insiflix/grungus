export function visibleEmojiRows(count: number, scrollTop: number, columns: number, height = 250) {
  const rows = Math.ceil(count / columns);
  const first = Math.max(0, Math.min(rows, Math.floor(scrollTop / 41) - 2));
  const last = Math.min(rows, first + Math.ceil(height / 41) + 4);
  return { start: first * columns, end: Math.min(count, last * columns), top: first * 41, bottom: Math.max(0, (rows - last) * 41) };
}
