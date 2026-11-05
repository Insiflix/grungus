import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";

const execute = promisify(execFile);
const pactl = async (...args: string[]) => (await execute("pactl", args, { timeout: 5000, maxBuffer: 1024 * 1024 })).stdout.trim();
type Properties = Record<string, unknown>;
interface Sink { index: number; name: string }
interface SinkInput { index: number; sink: number; client: number | null; owner_module: number | null; properties?: Properties }
interface PulseClient { index: number; properties?: Properties }
interface Routing {
  sink: Sink;
  output: Sink;
  relay: string;
  moved: Map<number, { sink: number; client: number | null }>;
}

/** Records a mix of other applications. Grungus stays on the physical output;
 * the mix is relayed there so other applications remain audible locally.
 * Never change the system's default sink or record its full, echoing monitor. */
export class LinuxSystemAudio {
  private authorized = false;
  private modules: string[] = [];
  private routing: Routing | null = null;
  private pending: Promise<string | null> | null = null;
  private cleanup: Promise<void> | null = null;
  private routingTask: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running = false;
  constructor(
    private platform: NodeJS.Platform = process.platform,
    private run = pactl,
    private excludedProcessIds: () => number[] = () => [process.pid],
  ) {}
  authorize(enabled: boolean) { this.authorized = enabled; }
  private async list<T>(kind: string): Promise<T[]> {
    const result: unknown = JSON.parse(await this.run("-f", "json", "list", kind));
    if (!Array.isArray(result)) throw new Error("Invalid audio server response");
    return result;
  }
  private async load(...args: string[]): Promise<string> {
    const module = await this.run("load-module", ...args);
    if (!/^\d+$/.test(module)) throw new Error("Invalid audio module");
    this.modules.push(module); return module;
  }
  claim(): Promise<string | null> {
    if (!this.authorized || this.platform !== "linux" || this.pending) return Promise.resolve(null);
    this.authorized = false;
    const operation = (async () => {
      await this.stop();
      const name = `grungus_share_${randomUUID().replaceAll("-", "")}`;
      const mix = `${name}_mix`;
      try {
        const outputName = await this.run("get-default-sink");
        await this.load("module-null-sink", `sink_name=${mix}`, "rate=48000", "channels=2", "sink_properties=device.description=Grungus_Sharing_Mix");
        const sinks = await this.list<Sink>("sinks");
        const output = sinks.find(sink => sink.name === outputName);
        const sink = sinks.find(sink => sink.name === mix);
        if (!output || !sink || output.index === sink.index) throw new Error("Audio output unavailable");
        const relay = await this.load("module-loopback", `source=${mix}.monitor`, `sink=${outputName}`, "latency_msec=30", "source_dont_move=true", "sink_dont_move=true", "sink_input_properties=application.name=GrungusShareRelay");
        this.routing = { sink, output, relay, moved: new Map() };
        await this.load("module-remap-source", `master=${mix}.monitor`, `source_name=${name}`, `source_properties=device.description=${name}`);
        await this.routeInputs();
        this.running = true; this.schedule();
        return name;
      } catch {
        await this.stop();
        throw new Error("Could not capture other applications without Grungus audio. Check pactl (pulseaudio-utils) and PulseAudio or pipewire-pulse, then share again.");
      }
    })();
    this.pending = operation;
    void operation.finally(() => { this.pending = null; }).catch(() => {});
    return operation;
  }
  private async routeInputs(): Promise<void> {
    const routing = this.routing;
    if (!routing) return;
    const [inputs, clients] = await Promise.all([this.list<SinkInput>("sink-inputs"), this.list<PulseClient>("clients")]);
    const excluded = new Set(this.excludedProcessIds().map(String));
    const properties = new Map(clients.map(client => [client.index, client.properties]));
    for (const input of inputs) {
      if (String(input.owner_module) === routing.relay) continue;
      const pid = String(input.properties?.["application.process.id"] ?? properties.get(input.client ?? -1)?.["application.process.id"] ?? "");
      // Unknown owners are omitted rather than risk feeding our call back.
      if (!/^\d+$/.test(pid) || pid === "0") {
        if (input.sink === routing.sink.index) await this.run("move-sink-input", String(input.index), String(routing.output.index));
        continue;
      }
      if (excluded.has(pid)) {
        if (input.sink === routing.sink.index) await this.run("move-sink-input", String(input.index), String(routing.output.index));
        continue;
      }
      if (input.sink !== routing.output.index) continue;
      try {
        await this.run("move-sink-input", String(input.index), String(routing.sink.index));
        if (!routing.moved.has(input.index)) routing.moved.set(input.index, { sink: input.sink, client: input.client });
      } catch { /* An application can close its stream between listing and moving. */ }
    }
  }
  private schedule() {
    this.timer = setTimeout(() => {
      this.routingTask = this.routeInputs().catch(() => { this.running = false; }).finally(() => {
        this.routingTask = null;
        if (this.running) this.schedule();
        else void this.stop();
      });
    }, 500);
  }
  stop(): Promise<void> {
    if (this.cleanup) return this.cleanup;
    this.running = false; clearTimeout(this.timer);
    const cleanup = (async () => {
      await this.routingTask;
      const routing = this.routing;
      this.routing = null;
      if (routing) {
        const inputs = await this.list<SinkInput>("sink-inputs").catch(() => []);
        for (const input of inputs) {
          if (input.sink !== routing.sink.index || String(input.owner_module) === routing.relay) continue;
          const previous = routing.moved.get(input.index);
          const destination = previous?.client === input.client ? previous.sink : routing.output.index;
          await this.run("move-sink-input", String(input.index), String(destination)).catch(() => {});
        }
      }
      for (const module of this.modules.splice(0).reverse()) await this.run("unload-module", module).catch(() => {});
    })();
    this.cleanup = cleanup;
    void cleanup.finally(() => { this.cleanup = null; }).catch(() => {});
    return cleanup;
  }
  async cancel() {
    this.authorized = false;
    await this.pending?.catch(() => {});
    await this.stop();
  }
}
