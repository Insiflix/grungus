import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  app: { isPackaged: true, getVersion: vi.fn(() => "1.0.0"), once: vi.fn() },
  updater: {
    on: vi.fn(), checkForUpdates: vi.fn(), quitAndInstall: vi.fn(),
    autoDownload: false, autoInstallOnAppQuit: false, allowDowngrade: true, allowPrerelease: true,
  },
  showMessageBox: vi.fn(),
}));
vi.mock("electron", () => ({ app: mocks.app, dialog: { showMessageBox: mocks.showMessageBox } }));
vi.mock("electron-updater", () => ({ default: { autoUpdater: mocks.updater } }));
import { startAutoUpdates } from "../../../electron/updates.js";

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.stubEnv("APPIMAGE", "/tmp/Grungus.AppImage");
  mocks.app.isPackaged = true;
  mocks.app.getVersion.mockReturnValue("1.0.0");
  mocks.updater.checkForUpdates.mockResolvedValue(null);
  mocks.showMessageBox.mockResolvedValue({ response: 1 });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

it("does not check GitHub in development", () => {
  mocks.app.isPackaged = false;
  startAutoUpdates(() => null);
  expect(mocks.updater.checkForUpdates).not.toHaveBeenCalled();
});

it("checks on startup and every four hours, then stops on quit", () => {
  startAutoUpdates(() => null);
  expect(mocks.updater.checkForUpdates).toHaveBeenCalledOnce();
  expect(mocks.updater.autoDownload).toBe(true);
  expect(mocks.updater.autoInstallOnAppQuit).toBe(true);
  expect(mocks.updater.allowDowngrade).toBe(false);
  expect(mocks.updater.allowPrerelease).toBe(false);
  vi.advanceTimersByTime(4 * 60 * 60 * 1000);
  expect(mocks.updater.checkForUpdates).toHaveBeenCalledTimes(2);
  mocks.app.once.mock.calls[0][1]();
  vi.advanceTimersByTime(4 * 60 * 60 * 1000);
  expect(mocks.updater.checkForUpdates).toHaveBeenCalledTimes(2);
});

it.each([["1.1.0-beta.1", true], ["1.1.0+build-test", false]])("sets the preview policy for %s", (version, prerelease) => {
  mocks.app.getVersion.mockReturnValue(version);
  startAutoUpdates(() => null);
  expect(mocks.updater.allowPrerelease).toBe(prerelease);
});

it("restarts only when requested after download", async () => {
  startAutoUpdates(() => null);
  const downloaded = mocks.updater.on.mock.calls.find(([event]) => event === "update-downloaded")![1];
  await downloaded({ version: "1.1.0" });
  expect(mocks.updater.quitAndInstall).not.toHaveBeenCalled();
  mocks.showMessageBox.mockResolvedValue({ response: 0 });
  await downloaded({ version: "1.1.0" });
  expect(mocks.updater.quitAndInstall).toHaveBeenCalledOnce();
});

it("handles failed update checks without rejecting application startup", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  mocks.updater.checkForUpdates.mockRejectedValue(new Error("Offline"));
  startAutoUpdates(() => null);
  await Promise.resolve();
  expect(warn).toHaveBeenCalledWith("Unable to check for Grungus updates", expect.any(Error));
});
