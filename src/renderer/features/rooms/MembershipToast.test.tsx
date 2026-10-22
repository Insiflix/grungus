// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { membershipNotices } from "../../../domain/matrix/MembershipNotices";
import { MembershipToast } from "./MembershipToast";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
afterEach(() => { membershipNotices.clear(); vi.useRealTimers(); });
describe("membership popups", () => {
  it("announces, replaces, dismisses, and expires successful changes", async () => {
    vi.useFakeTimers();
    const host = document.createElement("div");
    const root = createRoot(host);
    try {
      await act(async () => root.render(<MembershipToast />));
      expect(host.textContent).toBe("");
      await act(async () => membershipNotices.publish("join", { name: "<Pond>", isSpace: true }));
      expect(host.querySelector('[role="status"]')?.textContent).toBe("Joined space <Pond>");
      expect(host.querySelector("pond")).toBeNull();
      const oldId = membershipNotices.getSnapshot()!.id;
      await act(async () => { vi.advanceTimersByTime(5000); membershipNotices.publish("leave", { name: "Lounge" }); });
      await act(async () => { membershipNotices.clear(oldId); vi.advanceTimersByTime(1000); });
      expect(host.textContent).toBe("Left room Lounge");
      await act(async () => host.querySelector<HTMLButtonElement>("button")!.click());
      expect(host.textContent).toBe("");
      await act(async () => membershipNotices.publish("join", { name: "General" }));
      await act(async () => vi.advanceTimersByTime(6000));
      expect(host.textContent).toBe("");
    } finally { await act(async () => root.unmount()); }
  });
});
