import React, { Profiler } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { TimelinePanel } from "../../src/renderer/features/chat/TimelinePanel";
import { room, syncTick, typingRequests, configureTypingBenchmark } from "./typing-performance-runtime";
import "../../src/renderer/styles/index.css";

let commits: number[] = [];
let events: { duration: number; processing: number; delay: number }[] = [];
const observer = new PerformanceObserver(list => { for (const entry of list.getEntries() as PerformanceEventTiming[]) { if (entry.name === "keydown" || entry.name === "input") events.push({ duration: entry.duration, processing: entry.processingEnd - entry.processingStart, delay: entry.processingStart - entry.startTime }); } });
observer.observe({ type: "event", buffered: true, durationThreshold: 16 } as PerformanceObserverInit);
const root = createRoot(document.getElementById("root")!);
flushSync(() => root.render(<div className="chat-workspace" style={{ height: "100%", display: "flex", flexDirection: "column" }}><Profiler id="timeline" onRender={(_, __, duration) => commits.push(duration)}><TimelinePanel room={room} onOpenIdentity={() => {}} onOpenSettings={() => {}} onCall={() => {}} callActive={false} onDirectCall={() => {}} /></Profiler></div>));
let timer: ReturnType<typeof setInterval> | undefined;
Object.assign(window, {
  startTypingBenchmark(sync: boolean, simulateCrypto = false) {
    configureTypingBenchmark(simulateCrypto);
    clearInterval(timer); commits = []; events = [];
    const input = document.querySelector("textarea")!;
    input.focus();
    if (sync) timer = setInterval(syncTick, 100);
    return { rows: document.querySelectorAll(".message-row").length, members: room.memberCount };
  },
  stopTypingBenchmark() {
    clearInterval(timer);
    return { value: document.querySelector("textarea")!.value, typingRequests, commits, events };
  },
});
