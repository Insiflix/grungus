// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { guardWidgetMessages } from "./WidgetMessageGuard";

describe("isolated widget message gate", () => {
  it("accepts only the widget's exact source window and origin before the transport sees messages", () => {
    const frame = document.createElement("iframe"); document.body.append(frame);
    const receive = vi.fn();
    const release = guardWidgetMessages(frame, "widget", "https://call.example.org/element-call/index.html");
    window.addEventListener("message", receive);
    const data = { widgetId: "widget", action: "capabilities", requestId: "test", api: "fromWidget" };
    try {
      window.dispatchEvent(new MessageEvent("message", { data, source: frame.contentWindow, origin: "https://attacker.example.org" }));
      window.dispatchEvent(new MessageEvent("message", { data, source: window, origin: "https://call.example.org" }));
      expect(receive).not.toHaveBeenCalled();
      window.dispatchEvent(new MessageEvent("message", { data, source: frame.contentWindow, origin: "https://call.example.org" }));
      expect(receive).toHaveBeenCalledOnce();
      release();
      window.dispatchEvent(new MessageEvent("message", { data, source: window, origin: "https://attacker.example.org" }));
      expect(receive).toHaveBeenCalledTimes(2);
    } finally { release(); window.removeEventListener("message", receive); frame.remove(); }
  });
});
