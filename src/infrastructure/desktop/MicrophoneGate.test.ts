import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

function fixture() {
  let Gate!: new () => { port: { onmessage: (event: { data: object }) => void }; process: (input: Float32Array[][], output: Float32Array[][]) => boolean };
  class Processor { port = { onmessage: () => {}, postMessage: () => {} }; }
  runInNewContext(readFileSync("scripts/microphone-gate.js", "utf8"), { AudioWorkletProcessor: Processor, sampleRate: 48000, registerProcessor: (_: string, processor: typeof Gate) => { Gate = processor; } });
  const gate = new Gate();
  gate.port.onmessage({ data: { enabled: true, thresholdDb: -30, closeDb: -40, holdMs: 200 } });
  const block = (amplitude: number, count = 1) => {
    let output = new Float32Array(128);
    for (let i = 0; i < count; i++) { output = new Float32Array(128); gate.process([[new Float32Array(128).fill(amplitude)]], [[output]]); }
    return Math.max(...output.map(Math.abs));
  };
  return { gate, block };
}

describe("sample-clock microphone input sensitivity", () => {
  it("blocks quiet input and opens above the configured dBFS threshold", () => {
    const { block } = fixture();
    expect(block(.001, 20)).toBe(0);
    expect(block(.1, 4)).toBeCloseTo(.1);
  });
  it("keeps word endings open using hysteresis and the hold time, then closes", () => {
    const { block } = fixture();
    block(.1, 4);
    expect(block(.02, 100)).toBeCloseTo(.02); // -34 dBFS: between opening and closing thresholds.
    expect(block(.001, 20)).toBeCloseTo(.001); // Still inside the 200 ms hold.
    expect(block(.001, 80)).toBe(0);
    expect(block(.02, 100)).toBe(0); // Cannot reopen below -30 dBFS.
    expect(block(.1, 4)).toBeCloseTo(.1);
  });
  it("bypasses suppression when custom sensitivity is disabled", () => {
    const { gate, block } = fixture();
    gate.port.onmessage({ data: { enabled: false } });
    expect(block(.001, 4)).toBeCloseTo(.001, 6);
  });
});
