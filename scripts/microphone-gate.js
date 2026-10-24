// Sample-clock noise gate: continues working while the app is minimized.
class MicrophoneGate extends AudioWorkletProcessor {
  constructor() {
    super();
    this.settings = { enabled: false, thresholdDb: -45, closeDb: -50, holdMs: 200 };
    this.open = false; this.gain = 0; this.hold = 0; this.elapsed = 0; this.destroyed = false;
    this.port.onmessage = ({ data }) => { if (data === 'destroy') this.destroyed = true; else Object.assign(this.settings, data); };
  }
  process(inputs, outputs) {
    if (this.destroyed) return false;
    const input = inputs[0]?.[0];
    const output = outputs[0]?.[0];
    if (!output) return true;
    let power = 0;
    if (input) for (const sample of input) power += sample * sample;
    const db = Math.max(-100, 10 * Math.log10(Math.max(1e-10, power / (input?.length || 1))));
    const { enabled, thresholdDb, closeDb, holdMs } = this.settings;
    if (db >= (this.open ? closeDb : thresholdDb)) { this.open = true; this.hold = sampleRate * holdMs / 1000; }
    else { this.hold = Math.max(0, this.hold - output.length); if (!this.hold) this.open = false; }
    const target = !enabled || this.open ? 1 : 0;
    // Fast opening, soft closing prevent clicks; hysteresis and hold protect word endings.
    const step = 1 / (sampleRate * (target ? .003 : .02));
    for (let index = 0; index < output.length; index++) {
      this.gain += Math.max(-step, Math.min(step, target - this.gain));
      output[index] = (input?.[index] || 0) * this.gain;
    }
    this.elapsed += output.length;
    if (this.elapsed >= sampleRate / 20) {
      this.elapsed = 0;
      this.port.postMessage({ db, open: !enabled || this.open });
    }
    return true;
  }
}
registerProcessor('grungus-microphone-gate', MicrophoneGate);
