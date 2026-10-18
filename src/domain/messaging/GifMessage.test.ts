import { describe, expect, it } from "vitest";
import { createGifMessage, parseGifMessage } from "./GifMessage";

describe("GIF message protocol", () => {
  const url = "https://static.klipy.com/example.gif?size=full&v=2";
  it("round-trips the exact /gif URL format as ordinary text", () => {
    expect(createGifMessage(url)).toBe(`/gif ${url}`);
    expect(parseGifMessage(createGifMessage(url))).toBe(url);
  });
  it.each(["hello /gif https://example.com/a.gif", "/gift https://example.com/a.gif", "/gif", "/gif https://example.com/a.gif extra text",
    "/gif javascript:alert(1)", "/gif data:image/gif;base64,AAAA", "/gif file:///C:/secret.gif", "/gif http://example.com/a.gif", "/gif https://user:password@example.com/a.gif"])("does not embed malformed or unsafe messages: %s", (body) => {
    expect(parseGifMessage(body)).toBeNull();
  });
  it("keeps incoming GIFs provider-independent", () => {
    expect(parseGifMessage("  /gif https://media.tenor.com/example/tenor.gif  ")).toBe("https://media.tenor.com/example/tenor.gif");
  });
  it("rejects an invalid outgoing URL before attempting to send", () => {
    expect(() => createGifMessage("javascript:alert(1)")).toThrow("HTTPS");
  });
});
