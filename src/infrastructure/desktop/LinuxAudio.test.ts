import { afterEach, describe, expect, it, vi } from "vitest";
import { LinuxSystemAudio } from "../../../electron/linuxAudio";
afterEach(() => vi.useRealTimers());

function fixture() {
  const sinks = [{ index: 1, name: "speakers" }, { index: 8, name: "headphones" }];
  const inputs = [
    { index: 10, sink: 1, client: 10, owner_module: null as number | null, properties: { "application.process.id": "100" } },
    { index: 11, sink: 1, client: 11, owner_module: null as number | null, properties: { "application.process.id": "101" } },
    { index: 20, sink: 1, client: 20, owner_module: null as number | null, properties: { "application.process.id": "200" } },
    { index: 21, sink: 8, client: 21, owner_module: null as number | null, properties: { "application.process.id": "201" } },
  ];
  let module = 40;
  const run = vi.fn(async (...args: string[]) => {
    if (args[0] === "get-default-sink") return "speakers";
    if (args[0] === "load-module") {
      module++;
      if (args[1] === "module-null-sink") sinks.push({ index: 2, name: args.find(arg => arg.startsWith("sink_name="))!.slice(10) });
      if (args[1] === "module-loopback") inputs.push({ index: 90, sink: 1, client: 90, owner_module: module, properties: { "application.process.id": "999" } });
      return String(module);
    }
    if (args[0] === "-f") return JSON.stringify(args[3] === "sinks" ? sinks : args[3] === "sink-inputs" ? inputs : [{ index: 30, properties: { "application.process.id": "101" } }]);
    if (args[0] === "move-sink-input") { inputs.find(input => input.index === Number(args[1]))!.sink = Number(args[2]); return ""; }
    return "";
  });
  const audio = new LinuxSystemAudio("linux", run, () => [100, 101]);
  return { audio, run, inputs, sinks };
}

describe("Linux computer audio consent and cleanup", () => {
  it("captures other apps without moving Grungus or feeding the relay back, and restores routing", async () => {
    const { audio, run, inputs } = fixture();
    expect(await audio.claim()).toBeNull();
    expect(run).not.toHaveBeenCalled();
    audio.authorize(true);
    const name = await audio.claim();
    expect(name).toMatch(/^grungus_share_/);
    expect(run).toHaveBeenCalledWith("load-module", "module-remap-source", `master=${name}_mix.monitor`, `source_name=${name}`, `source_properties=device.description=${name}`);
    expect(inputs.find(input => input.index === 10)!.sink).toBe(1);
    expect(inputs.find(input => input.index === 11)!.sink).toBe(1);
    expect(inputs.find(input => input.index === 20)!.sink).toBe(2);
    expect(inputs.find(input => input.index === 21)!.sink).toBe(8);
    expect(inputs.find(input => input.index === 90)!.sink).toBe(1);
    expect(await audio.claim()).toBeNull();
    await audio.cancel();
    expect(inputs.find(input => input.index === 20)!.sink).toBe(1);
    expect(run.mock.calls.filter(args => args[0] === "unload-module")).toEqual([["unload-module", "43"], ["unload-module", "42"], ["unload-module", "41"]]);
    expect(run.mock.calls.some(args => args[0] === "set-default-sink")).toBe(false);
  });

  it("waits for pending creation before unloading on call teardown", async () => {
    let finish!: (id: string) => void;
    const { audio, run } = fixture();
    const execute = run.getMockImplementation()!;
    run.mockImplementation(async (...args: string[]) => {
      const result = await execute(...args);
      return args[1] === "module-remap-source" ? new Promise<string>(resolve => { finish = resolve; }) : result;
    });
    audio.authorize(true);
    const claimed = audio.claim();
    await vi.waitFor(() => expect(finish).toBeDefined());
    const cancelled = audio.cancel();
    finish("73");
    await claimed; await cancelled;
    expect(run.mock.calls.filter(args => args[0] === "unload-module")).toEqual([["unload-module", "73"], ["unload-module", "42"], ["unload-module", "41"]]);
    expect(await audio.claim()).toBeNull();
  });

  it("includes newly started apps, excludes Grungus via client metadata, and respects manual output changes", async () => {
    vi.useFakeTimers();
    const { audio, inputs } = fixture();
    audio.authorize(true); await audio.claim();
    inputs.push({ index: 30, sink: 2, client: 30, owner_module: null, properties: { "application.process.id": "" } });
    inputs[inputs.length - 1].properties = {} as { "application.process.id": string };
    inputs.push({ index: 31, sink: 1, client: 31, owner_module: null, properties: { "application.process.id": "300" } });
    inputs.push({ index: 32, sink: 1, client: 32, owner_module: null, properties: {} as { "application.process.id": string } });
    await vi.advanceTimersByTimeAsync(500);
    expect(inputs.find(input => input.index === 30)!.sink).toBe(1);
    expect(inputs.find(input => input.index === 31)!.sink).toBe(2);
    expect(inputs.find(input => input.index === 32)!.sink).toBe(1);
    inputs.find(input => input.index === 20)!.sink = 8;
    await audio.cancel();
    expect(inputs.find(input => input.index === 20)!.sink).toBe(8);
    expect(inputs.find(input => input.index === 31)!.sink).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("unloads an incomplete mix if setup fails instead of falling back to echoing output capture", async () => {
    const { audio, run } = fixture();
    const execute = run.getMockImplementation()!;
    run.mockImplementation(async (...args: string[]) => {
      if (args[1] === "module-remap-source") throw new Error("audio setup failed");
      return execute(...args);
    });
    audio.authorize(true);
    await expect(audio.claim()).rejects.toThrow("without Grungus audio");
    expect(run.mock.calls.filter(args => args[0] === "unload-module")).toEqual([["unload-module", "42"], ["unload-module", "41"]]);
    expect(run.mock.calls.some(args => args.includes("master=speakers.monitor"))).toBe(false);
  });

  it("reports actionable errors instead of capturing the microphone", async () => {
    const audio = new LinuxSystemAudio("linux", vi.fn().mockRejectedValue(new Error("ENOENT")));
    audio.authorize(true);
    await expect(audio.claim()).rejects.toThrow("pulseaudio-utils");
    await audio.cancel();
  });
});
