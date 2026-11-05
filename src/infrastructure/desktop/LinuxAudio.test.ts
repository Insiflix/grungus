import { describe, expect, it, vi } from "vitest";
import { LinuxSystemAudio } from "../../../electron/linuxAudio";

describe("Linux computer audio consent and cleanup", () => {
  it("creates an output monitor only after consent and consumes that consent once", async () => {
    const run = vi.fn(async (...args: string[]) => args[0] === "get-default-sink" ? "alsa_output.test" : "42");
    const audio = new LinuxSystemAudio("linux", run);
    expect(await audio.claim()).toBeNull();
    expect(run).not.toHaveBeenCalled();
    audio.authorize(true);
    const name = await audio.claim();
    expect(name).toMatch(/^grungus_share_/);
    expect(run).toHaveBeenCalledWith("load-module", "module-remap-source", "master=alsa_output.test.monitor", `source_name=${name}`, `source_properties=device.description=${name}`);
    expect(await audio.claim()).toBeNull();
    await audio.cancel();
    expect(run).toHaveBeenLastCalledWith("unload-module", "42");
  });

  it("waits for pending creation before unloading on call teardown", async () => {
    let finish!: (id: string) => void;
    const run = vi.fn(async (...args: string[]) => {
      if (args[0] === "get-default-sink") return "sink";
      if (args[0] === "load-module") return new Promise<string>(resolve => { finish = resolve; });
      return "";
    });
    const audio = new LinuxSystemAudio("linux", run);
    audio.authorize(true);
    const claimed = audio.claim();
    await vi.waitFor(() => expect(finish).toBeDefined());
    const cancelled = audio.cancel();
    finish("73");
    await claimed; await cancelled;
    expect(run).toHaveBeenLastCalledWith("unload-module", "73");
    expect(await audio.claim()).toBeNull();
  });

  it("reports actionable errors instead of capturing the microphone", async () => {
    const audio = new LinuxSystemAudio("linux", vi.fn().mockRejectedValue(new Error("ENOENT")));
    audio.authorize(true);
    await expect(audio.claim()).rejects.toThrow("pulseaudio-utils");
    await audio.cancel();
  });
});
