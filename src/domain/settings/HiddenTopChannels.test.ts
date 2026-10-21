// @vitest-environment jsdom
import { beforeEach, expect, it } from "vitest";
import { channelTabVisible, HiddenTopChannels } from "./HiddenTopChannels";
beforeEach(() => localStorage.clear());
it("hides only until a newer message or an explicit reopen, and persists across reload", () => {
  const store = new HiddenTopChannels(); store.setAccount("alice"); store.hide("!general", 100);
  expect(channelTabVisible(store.getSnapshot(), "!general", 100)).toBe(false);
  expect(channelTabVisible(store.getSnapshot(), "!general", 101)).toBe(true);
  const restored = new HiddenTopChannels(); restored.setAccount("alice");
  expect(channelTabVisible(restored.getSnapshot(), "!general", 100)).toBe(false);
  restored.reopen("!general"); expect(channelTabVisible(restored.getSnapshot(), "!general", 100)).toBe(true);
  restored.setAccount("bob"); expect(restored.getSnapshot()).toEqual({});
});
it("ignores corrupt stored entries", () => {
  localStorage.setItem("grungus.hidden-top-channels.alice", JSON.stringify({ "!good": 12, "!bad": "yes" }));
  const store = new HiddenTopChannels(); store.setAccount("alice"); expect(store.getSnapshot()).toEqual({ "!good": 12 });
});
