// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { enableNotifications, showNotification } from "./Notifications";

afterEach(() => vi.unstubAllGlobals());
describe("native notification transport", () => {
  it.each(["win32", "linux"])("uses native notifications on %s even without browser permission", async platform => {
    const show = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("desktop", { platform, notifications: { isSupported: vi.fn().mockResolvedValue(true), show } });
    vi.stubGlobal("Notification", undefined);
    await enableNotifications();
    const value = { title: "Room", body: "New activity", silent: true, roomId: "!room:example.org" };
    await showNotification(value);
    expect(show).toHaveBeenCalledWith(value);
  });
  it("reports native unavailability and delivery failures", async () => {
    const isSupported = vi.fn().mockResolvedValue(false);
    vi.stubGlobal("desktop", { notifications: { isSupported, show: vi.fn().mockRejectedValue(new Error("Delivery failed")) } });
    await expect(enableNotifications()).rejects.toThrow("unavailable");
    await expect(showNotification({ title: "Test", body: "Test", silent: true })).rejects.toThrow("Delivery failed");
  });
});
