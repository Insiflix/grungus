import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";

const execute = promisify(execFile);
const pactl = async (...args: string[]) => (await execute("pactl", args, { timeout: 5000, maxBuffer: 65536 })).stdout.trim();

/** Exposes the output monitor as a regular input Chromium can capture. Works
 * with PulseAudio and PipeWire's PulseAudio server, for screens and windows. */
export class LinuxSystemAudio {
  private authorized = false;
  private module: string | null = null;
  private pending: Promise<string | null> | null = null;
  constructor(private platform: NodeJS.Platform = process.platform, private run = pactl) {}
  authorize(enabled: boolean) { this.authorized = enabled; }
  claim(): Promise<string | null> {
    if (!this.authorized || this.platform !== "linux" || this.pending) return Promise.resolve(null);
    this.authorized = false;
    const operation = (async () => {
      await this.stop();
      const name = `grungus_share_${randomUUID().replaceAll("-", "")}`;
      try {
        const sink = await this.run("get-default-sink");
        const module = await this.run("load-module", "module-remap-source", `master=${sink}.monitor`, `source_name=${name}`, `source_properties=device.description=${name}`);
        if (!/^\d+$/.test(module)) throw new Error("Invalid audio module");
        this.module = module;
        return name;
      } catch { throw new Error("Could not capture computer audio. Install pactl (pulseaudio-utils) and enable PulseAudio or pipewire-pulse, then share again."); }
    })();
    this.pending = operation;
    void operation.finally(() => { this.pending = null; }).catch(() => {});
    return operation;
  }
  async stop() {
    const module = this.module;
    this.module = null;
    if (module) await this.run("unload-module", module).catch(() => {});
  }
  async cancel() {
    this.authorized = false;
    await this.pending?.catch(() => {});
    await this.stop();
  }
}
