import { describe, expect, it } from "vitest";
import { visibleEmojiRows } from "./EmojiVirtualization";
describe("emoji viewport", () => {
  it("bounds rendered buttons even for a category with hundreds of emoji", () => {
    for (const columns of [7, 8]) {
      const range = visibleEmojiRows(529, 0, columns);
      expect(range.start).toBe(0);
      expect(range.end).toBeLessThanOrEqual(88);
      expect(range.bottom).toBeGreaterThan(0);
    }
  });
  it("includes the final row after scrolling and handles empty searches", () => {
    const range = visibleEmojiRows(529, 2500, 8);
    expect(range.end).toBe(529);
    expect(range.bottom).toBe(0);
    expect(visibleEmojiRows(0, 0, 8)).toEqual({ start: 0, end: 0, top: 0, bottom: 0 });
  });
});
