import type { DesktopCapturerSource, DisplayMediaRequestHandlerHandlerRequest, Streams } from "electron";
import { randomUUID } from "node:crypto";
import type { ScreenShareRequest } from "./shared/session.js";
interface CaptureDependencies {
  platform: NodeJS.Platform;
  getSources(): Promise<DesktopCapturerSource[]>;
  isTrusted(request: DisplayMediaRequestHandlerHandlerRequest): boolean;
  notify(request: ScreenShareRequest): void;
  dismiss(requestId: string): void;
}
export class DesktopCaptureBroker {
  private pending: { id: string; sources: DesktopCapturerSource[]; audioRequested: boolean; callback: (streams: Streams) => void; timeout: ReturnType<typeof setTimeout> } | null = null;
  private preparing = false;
  constructor(private dependencies: CaptureDependencies) {}
  request = async (request: DisplayMediaRequestHandlerHandlerRequest, callback: (streams: Streams) => void) => {
    if (!request.videoRequested || !this.dependencies.isTrusted(request) || this.pending || this.preparing) { callback({}); return; }
    this.preparing = true;
    try {
      const sources = await this.dependencies.getSources();
      if (!sources.length || !this.dependencies.isTrusted(request)) { callback({}); return; }
      const id = randomUUID();
      this.pending = { id, sources, audioRequested: request.audioRequested, callback, timeout: setTimeout(() => this.respond(id, null, false), 120000) };
      this.dependencies.notify({ id, sources: sources.map(source => ({ id: source.id, name: source.name, kind: source.id.startsWith("screen:") ? "screen" : "window", thumbnail: source.thumbnail.toDataURL(), icon: source.appIcon?.toDataURL() })), audioRequested: request.audioRequested, systemAudioSupported: this.dependencies.platform === "win32" });
    } catch { if (this.pending) this.cancel(); else callback({}); }
    finally { this.preparing = false; }
  };
  respond(requestId: string, sourceId: string | null, audio: boolean): void {
    const pending = this.pending;
    if (!pending || pending.id !== requestId) return;
    this.pending = null; clearTimeout(pending.timeout);
    const video = pending.sources.find(source => source.id === sourceId);
    const includeAudio = Boolean(video && audio && pending.audioRequested && this.dependencies.platform === "win32");
    pending.callback(video ? { video, ...(includeAudio ? { audio: "loopback" as const } : {}) } : {});
    this.dependencies.dismiss(requestId);
  }
  cancel() { if (this.pending) this.respond(this.pending.id, null, false); }
}
