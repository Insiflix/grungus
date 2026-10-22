import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { MatrixMessage } from "../../../domain/matrix/MatrixTypes";
import { MessageRow } from "./MessageRow";

const message: MatrixMessage = {
  id: "$gif", roomId: "!room:example.org", sender: { id: "@alice:example.org", displayName: "Alice", avatarUrl: null },
  timestamp: 1_700_000_000_000, type: "text", body: "/gif https://static.klipy.com/frog.gif", edited: false,
  replyTo: null, reactions: [], sendState: "sent", isOwn: false, isRedacted: false,
};
const render = (changes: Partial<MatrixMessage> = {}) => renderToStaticMarkup(<MessageRow message={{ ...message, ...changes }} grouped={false} onReact={() => undefined} />);
describe("inline GIF messages", () => {
  it("highlights messages mentioning you and displays mention names safely", () => {
    const html = render({ body: "Hello @me:example.org", mentionsOwnUser: true, mentions: [{ id: "@me:example.org", displayName: "Me <script>", avatarUrl: null }] });
    expect(html).toContain("is-mentioned");
    expect(html).toContain('aria-label="Message mentioning you"');
    expect(html).toContain("@Me &lt;script&gt;");
    expect(render({ body: "Hello @me:example.org" })).not.toContain("is-mentioned");
    expect(render({ isRedacted: true, mentionsOwnUser: true })).not.toContain("is-mentioned");
  });
  it("renders incoming emoji shortcodes and preserves literal code examples", () => {
    const html = render({ body: "Hello :smile: `:heart:`" });
    expect(html).toContain("Hello 😄 <code>:heart:</code>");
  });
  it("renders received /gif messages as images rather than command text", () => {
    const html = render();
    expect(html).toContain('src="https://static.klipy.com/frog.gif"');
    expect(html).toContain('alt="Geteiltes GIF"');
    expect(html).not.toContain("/gif https://");
  });
  it("renders outgoing GIFs and keeps send failures visible", () => {
    const html = render({ isOwn: true, sendState: "failed" });
    expect(html).toContain('alt="Geteiltes GIF"');
    expect(html).toContain("send-state--failed");
  });
  it("does not embed unsafe, encrypted, redacted, or regular text messages", () => {
    expect(render({ body: "/gif javascript:alert(1)" })).not.toContain("message-gif");
    expect(render({ type: "encrypted" })).not.toContain("message-gif");
    expect(render({ isRedacted: true })).not.toContain("message-gif");
    expect(render({ body: "hello" })).not.toContain("message-gif");
  });
});

it("renders membership changes as safe compact notices without message actions", () => {
  const html = render({ type: "membership", membershipChange: "join", body: "<script>Alice</script> joined the room." });
  expect(html).toContain('class="membership-notice"');
  expect(html).toContain("&lt;script&gt;Alice&lt;/script&gt; joined the room.");
  expect(html).not.toContain("message-toolbar");
  expect(html).not.toContain("message-avatar");
});
