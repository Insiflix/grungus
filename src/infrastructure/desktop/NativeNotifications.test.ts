import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BrowserWindow, IpcMain, IpcMainInvokeEvent } from "electron";
const mocks = vi.hoisted(() => ({ supported: true, instances: [] as any[], fail: false, image: { isEmpty: () => false } }));
vi.mock("electron", () => ({ nativeImage: { createFromBuffer: vi.fn(() => mocks.image) }, Notification: class extends EventEmitter {
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
  it("uses a validated context avatar instead of the app icon", async () => {
    const { show, value } = setup();
    const png = Buffer.alloc(24);
    Buffer.from("89504e470d0a1a0a", "hex").copy(png);
    png.writeUInt32BE(96, 16); png.writeUInt32BE(96, 20);
    await show({ ...value, iconDataUrl: `data:image/png;base64,${png.toString("base64")}` } as typeof value);
    expect(mocks.instances[0].options.icon).toBe(mocks.image);
  });
  it("rejects remote paths, oversized payloads, and huge image dimensions", () => {
    const { show, value } = setup();
    for (const iconDataUrl of ["file:///private.png", "https://example.org/avatar", "data:image/png;base64," + "A".repeat(350_000)]) {
      expect(() => show({ ...value, iconDataUrl } as typeof value)).toThrow("Invalid notification icon");
    }
    const png = Buffer.alloc(24);
    Buffer.from("89504e470d0a1a0a", "hex").copy(png);
    png.writeUInt32BE(4096, 16); png.writeUInt32BE(96, 20);
    expect(() => show({ ...value, iconDataUrl: `data:image/png;base64,${png.toString("base64")}` } as typeof value)).toThrow("Invalid notification icon");
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
