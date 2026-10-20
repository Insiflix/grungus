import { describe, expect, it, vi } from "vitest";
import type { BrowserWindow, IpcMain, IpcMainInvokeEvent } from "electron";
import { registerWindowControls } from "../../../electron/windowControls";

function setup() {
  const handlers = new Map<string, (event: IpcMainInvokeEvent) => unknown>();
  const frame = { url: "grungus-app://client/index.html" };
  let maximized = false;
  const window = { webContents: { mainFrame: frame }, isMaximized: () => maximized, minimize: vi.fn(), close: vi.fn(), maximize: vi.fn(() => { maximized = true; }), unmaximize: vi.fn(() => { maximized = false; }) };
  registerWindowControls({ handle: (name: string, fn: (event: IpcMainInvokeEvent) => unknown) => handlers.set(name, fn) } as unknown as IpcMain, () => window as unknown as BrowserWindow, url => url.startsWith("grungus-app://client/"));
  const event = { sender: window.webContents, senderFrame: frame } as unknown as IpcMainInvokeEvent;
  return { window, event, handlers };
}
describe("app window controls", () => {
  it("minimizes, toggles maximize/restore, reports state, and closes the app window", () => {
    const { window, event, handlers } = setup();
    const call = (name: string) => handlers.get(`window:${name}`)!(event);
    expect(call("state")).toEqual({ maximized: false });
    call("minimize"); expect(window.minimize).toHaveBeenCalledOnce();
    call("toggle-maximize"); expect(call("state")).toEqual({ maximized: true });
    call("toggle-maximize"); expect(call("state")).toEqual({ maximized: false });
    call("close"); expect(window.close).toHaveBeenCalledOnce();
  });
  it("rejects controls requested by embedded frames, other windows, or untrusted pages", () => {
    const { window, event, handlers } = setup();
    const close = handlers.get("window:close")!;
    expect(() => close({ ...event, senderFrame: { url: "https://external.example" } } as IpcMainInvokeEvent)).toThrow("Untrusted");
    expect(() => close({ ...event, sender: {} } as IpcMainInvokeEvent)).toThrow("Untrusted");
    window.webContents.mainFrame.url = "https://external.example";
    expect(() => close(event)).toThrow("Untrusted");
    expect(window.close).not.toHaveBeenCalled();
  });
});
