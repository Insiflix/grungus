// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultPreferences, parsePreferences, preferences } from "./Preferences";

beforeEach(() => { localStorage.clear(); preferences.setAccount(crypto.randomUUID()); });
describe("persisted preferences", () => {
  it("validates stored values and clamps font sizes", () => {
    expect(parsePreferences({ theme: "invalid", fontSize: 999, showAvatars: "false", sendTyping: false })).toMatchObject({ theme: "forest", fontSize: 22, showAvatars: true, sendTyping: false });
    expect(parsePreferences(null)).toEqual(defaultPreferences);
  });
  it("keeps settings isolated per account and restores them on return", () => {
    preferences.setAccount("@alice:example.org");
    preferences.update({ theme: "light", sendTyping: false });
    preferences.setAccount("@bob:example.org");
    expect(preferences.getSnapshot()).toEqual(defaultPreferences);
    preferences.update({ theme: "dark" });
    preferences.setAccount("@alice:example.org");
    expect(preferences.getSnapshot()).toMatchObject({ theme: "light", sendTyping: false });
  });
  it("does not report changes as saved if local persistence fails", () => {
    const previous = preferences.getSnapshot();
    const failure = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Storage full"); });
    expect(() => preferences.update({ theme: "light" })).toThrow("Storage full");
    expect(preferences.getSnapshot()).toBe(previous);
    failure.mockRestore();
  });
});
