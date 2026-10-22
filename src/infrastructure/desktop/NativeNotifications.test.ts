import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BrowserWindow, IpcMain, IpcMainInvokeEvent } from "electron";
const mocks = vi.hoisted(() => ({ supported: true, instances: [] as any[], fail: false }));
vi.mock("electron", () => ({ Notification: class extends EventEmitter {
  static isSupported() { return mocks.supported; }
  constructor(public options: unknown) { super(); mocks.instances.push(this); }
  show() { this.emit(mocks.fail ? "failed" : "show", {}, "OS failure"); }
  close() { this.emit("close"); }
} }));
import { registerNotifications } from "../../../electron/notifications";

function setup() {
  const handlers = new Map<string, Function>();
  const frame = { url: "grungus-app://client/index.html" };
  const window = { webContents: { mainFrame: frame, isDestroyed: () => false, getURL: () => frame.url, send: vi.fn() }, isDestroyed: () => false, isMinimized: () => true, restore: vi.fn(), show: vi.fn(), focus: vi.fn() };
  registerNotifications({ handle: (name: string, callback: Function) => handlers.set(name, callback) } as unknown as IpcMain, () => window as unknown as BrowserWindow, url => url.startsWith("grungus-app://client/"), "/app/grungus.png");
  const event = { sender: window.webContents, senderFrame: frame } as unknown as IpcMainInvokeEvent;
  const value = { title: "Room", body: "Private preview disabled", silent: true, roomId: "!room:example.org" };
  return { handlers, event, value, window, show: (payload = value) => handlers.get("notifications:show")!(event, payload) };
}
beforeEach(() => { mocks.instances = []; mocks.supported = true; mocks.fail = false; });
describe("native notification IPC", () => {
  it("shows a native notification and restores the room on click", async () => {
    const { show, window, value } = setup();
    await show();
    expect(mocks.instances[0].options).toEqual({ title: value.title, body: value.body, silent: true, icon: "/app/grungus.png" });
    mocks.instances[0].emit("click");
    expect(window.restore).toHaveBeenCalledOnce();
    expect(window.focus).toHaveBeenCalledOnce();
    expect(window.webContents.send).toHaveBeenCalledWith("notifications:open-room", value.roomId);
  });
  it("rejects embedded frames and invalid payloads", () => {
    const { handlers, event, value, show } = setup();
    expect(() => handlers.get("notifications:show")!({ ...event, senderFrame: { url: "grungus-app://call/element-call/index.html" } }, value)).toThrow("Untrusted");
    expect(() => show({ ...value, body: "x".repeat(4097) })).toThrow("Invalid");
    expect(mocks.instances).toHaveLength(0);
  });
  it("reports unsupported systems and OS failures", async () => {
    const { show } = setup();
    mocks.supported = false;
    expect(() => show()).toThrow("unavailable");
    mocks.supported = true; mocks.fail = true;
    await expect(show()).rejects.toThrow("OS failure");
  });
});
