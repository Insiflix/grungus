import { readFileSync } from "node:fs";
import { EventEmitter } from "node:events";
import { runInNewContext } from "node:vm";
import { afterEach, expect, it, vi } from "vitest";

afterEach(() => vi.useRealTimers());
it("restarts compiled Electron changes once, without node-only mode, and stops watching on shutdown", () => {
  vi.useFakeTimers();
  let changed!: (event: string, file: string) => void;
  const close = vi.fn();
  const watch = vi.fn((_path, _options, listener) => { changed = listener; return { close }; });
  const children: (EventEmitter & { kill: ReturnType<typeof vi.fn> })[] = [];
  const spawn = vi.fn((_command: string, _args: string[], _options: { env: Record<string, string | undefined>; windowsHide: boolean }) => {
    const child = Object.assign(new EventEmitter(), { kill: vi.fn() });
    child.kill.mockImplementation(() => child.emit("exit", 0));
    children.push(child); return child;
  });
  const handlers = new Map<string, () => void>();
  const process = { env: { VITE_DEV_SERVER_URL: "http://127.0.0.1:5173", ELECTRON_RUN_AS_NODE: "1" }, cwd: () => "/project", on: (signal: string, callback: () => void) => handlers.set(signal, callback), exit: vi.fn() };
  const source = readFileSync("scripts/start-electron.mjs", "utf8").replace(/^import .*;$/gm, "");
  runInNewContext(source, { process, spawn, watch, electronPath: "electron", setTimeout, clearTimeout, console: { log: vi.fn(), error: vi.fn() } });
  expect(spawn).toHaveBeenCalledTimes(1);
  expect(spawn.mock.calls[0][2].env.ELECTRON_RUN_AS_NODE).toBeUndefined();
  expect(spawn.mock.calls[0][2].windowsHide).toBe(false);
  changed("change", "main.js.map"); vi.advanceTimersByTime(600);
  expect(spawn).toHaveBeenCalledTimes(1);
  changed("change", "main.js"); changed("change", "preload.cjs");
  vi.advanceTimersByTime(500);
  expect(children[0].kill).toHaveBeenCalledOnce();
  expect(spawn).toHaveBeenCalledTimes(2);
  handlers.get("SIGTERM")!();
  expect(children[1].kill).toHaveBeenCalledWith("SIGTERM");
  expect(close).toHaveBeenCalled();
  expect(spawn).toHaveBeenCalledTimes(2);
});
