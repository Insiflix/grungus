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
  it("renders incoming emoji shortcodes and preserves literal code examples", () => {
    const html = render({ body: "Hello :smile: `:heart:`" });
    expect(html).toContain("Hello 😄 `:heart:`");
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
