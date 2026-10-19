import { describe, expect, it } from "vitest";
import { createMentionContent, mentionOccurrences, mentionQueryAt, searchMentionMembers } from "./Mentions";
const alice = { id: "@alice:example.org", displayName: "Alice <Admin>", avatarUrl: null };
const bob = { id: "@bob:example.org", displayName: "Bob", avatarUrl: null };

describe("room member mentions", () => {
  it("completes an @ query and replaces the rest of a partially edited token", () => {
    expect(mentionQueryAt("Hello @Ali", 10)).toEqual({ start: 6, end: 10, query: "Ali" });
    expect(mentionQueryAt("@Alice tail", 3)).toEqual({ start: 0, end: 6, query: "Al" });
    expect(searchMentionMembers([bob, alice], "ali")).toEqual([alice]);
    expect(searchMentionMembers([bob, alice], "bob:example")).toEqual([bob]);
  });
  it.each(["email@example.org", "`@alice", "```\n@alice", "https://example.org/@alice"])("does not autocomplete inside %s", text => {
    expect(mentionQueryAt(text, text.length)).toBeNull();
  });
  it("only pings exact known IDs outside code and links and deduplicates repeated mentions", () => {
    const body = `Hi ${alice.id}, ${alice.id}! \`${bob.id}\` https://example.org/${bob.id} @unknown:example.org`;
    expect(createMentionContent(body, [alice, bob])["m.mentions"].user_ids).toEqual([alice.id]);
    expect(mentionOccurrences(`${alice.id}.evil`, [alice])).toEqual([]);
  });
  it("creates safe Matrix mention links and leaves ordinary text escaped", () => {
    const content = createMentionContent(`<script>\nHello ${alice.id}`, [alice]);
    expect(content).toMatchObject({ "m.mentions": { user_ids: [alice.id] }, format: "org.matrix.custom.html" });
    expect(content.formatted_body).toContain("&lt;script&gt;<br>Hello ");
    expect(content.formatted_body).toContain("@Alice &lt;Admin&gt;</a>");
    expect(content.formatted_body).not.toContain("<script>");
  });
  it("uses empty explicit mention metadata for ordinary messages", () => {
    expect(createMentionContent("Alice, a question", [alice])).toEqual({ "m.mentions": { user_ids: [] } });
  });
});
