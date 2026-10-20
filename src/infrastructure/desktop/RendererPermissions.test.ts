import { describe, expect, it, vi } from "vitest";
import type { BrowserWindow, Session } from "electron";
import { allowsAppPermission, configureAppPermissions } from "../../../electron/permissions";

describe("desktop notification permissions", () => {
  it.each([
    [false, "http://127.0.0.1:5173/"], [false, "http://127.0.0.1:5173/index.html"],
    [true, "grungus-app://client/"], [true, "grungus-app://client/index.html"],
  ])("allows notifications in the trusted app (packaged: %s)", (packaged, url) => {
    expect(allowsAppPermission("notifications", url, packaged, true)).toBe(true);
    expect(allowsAppPermission("notifications", url, packaged, false)).toBe(false);
  });
  it("rejects external pages, other origins, frames, and unknown permissions", () => {
    for (const url of ["https://example.org", "http://127.0.0.1:5174", "http://localhost:5173", "grungus-app://other/index.html", "invalid"]) {
      expect(allowsAppPermission("notifications", url, true, true)).toBe(false);
    }
    expect(allowsAppPermission("notifications", "grungus-app://client/element-call/index.html", true, true)).toBe(false);
    expect(allowsAppPermission("geolocation", "grungus-app://client/", true, true)).toBe(false);
  });
  it("keeps microphone, screen capture, audio-output selection and fullscreen available to the call frame", () => {
    for (const permission of ["media", "display-capture", "speaker-selection", "fullscreen"]) {
      expect(allowsAppPermission(permission, "grungus-app://call/element-call/index.html", true, false)).toBe(true);
      expect(allowsAppPermission(permission, "http://localhost:5173/element-call/index.html", false, false)).toBe(true);
      expect(allowsAppPermission(permission, "grungus-app://call/index.html", true, false)).toBe(false);
      expect(allowsAppPermission(permission, "grungus-app://client/element-call/index.html", true, false)).toBe(false);
    }
  });
  it("handles both requests and Chromium’s origin-only notification checks", () => {
    const contents = { getURL: () => "grungus-app://client/" };
    const window = { webContents: contents } as unknown as BrowserWindow;
    const session = { setPermissionCheckHandler: vi.fn(), setPermissionRequestHandler: vi.fn() };
    configureAppPermissions(session as unknown as Session, () => window, true);
    const check = session.setPermissionCheckHandler.mock.calls[0][0];
    const request = session.setPermissionRequestHandler.mock.calls[0][0];
    expect(check(null, "notifications", "grungus-app://client", { isMainFrame: false })).toBe(true);
    expect(check(null, "notifications", "https://example.org", { isMainFrame: false })).toBe(false);
    expect(check({}, "notifications", "grungus-app://client", { isMainFrame: true })).toBe(false);
    const callback = vi.fn();
    request(contents, "notifications", callback, { requestingUrl: "grungus-app://client/", isMainFrame: true });
    expect(callback).toHaveBeenLastCalledWith(true);
    request(contents, "notifications", callback, { requestingUrl: "https://example.org", isMainFrame: true });
    expect(callback).toHaveBeenLastCalledWith(false);
  });
});
