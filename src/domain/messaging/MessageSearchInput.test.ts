import { expect, it } from "vitest";
import { activeSearchFilter, parseMessageSearch } from "./MessageSearchInput";
it("combines text with quoted, case-insensitive filters", () => {
  expect(parseMessageSearch('launch FROM:@alice:test in:"General chat" has:IMAGE after:2026-10-01 before:2026-10-20')).toEqual({text:"launch",sender:"@alice:test",channel:"General chat",media:"image",after:"2026-10-01",before:"2026-10-20"});
});
it("preserves URLs and words containing filter prefixes", () => {
  expect(parseMessageSearch('https://test/from:example within:reason')).toEqual({text:'https://test/from:example within:reason'});
});
it("rejects incomplete or unsupported filters", () => {
  for(const input of ['from:', 'in:""', 'has:unknown']) expect(() => parseMessageSearch(input)).toThrow();
});
it("completes the token at the cursor and leaves finished filters and URLs alone", () => {
  expect(activeSearchFilter("launch from:al has:image",14)).toMatchObject({key:"from",prefix:"al",start:7,end:14});
  expect(activeSearchFilter("from:@alice:test ",17)).toBeNull();
  expect(activeSearchFilter("https://test/from:alice",22)).toBeNull();
  expect(activeSearchFilter('in:"General chat',16)).toMatchObject({key:"in",prefix:"General chat"});
});
