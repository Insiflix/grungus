import { preferences, type Preferences } from "../../domain/settings/Preferences";

export type MicrophoneOptions = Pick<Preferences, "echoCancellation" | "noiseSuppression" | "autoGainControl" | "advancedNoiseSuppression" | "voiceFilter" | "inputGain" | "inputGate" | "inputThresholdDb" | "inputCloseDb" | "inputHoldMs">;
declare global {
  interface Window { grungusAudio?: { configure: (options: MicrophoneOptions) => Promise<void>; getLevel: (track: MediaStreamTrack) => { db: number; open: boolean } | undefined } }
}
export function microphoneOptions(prefs = preferences.getSnapshot()): MicrophoneOptions {
  const { echoCancellation, noiseSuppression, autoGainControl, advancedNoiseSuppression, voiceFilter, inputGain, inputGate, inputThresholdDb, inputCloseDb, inputHoldMs } = prefs;
  return { echoCancellation, noiseSuppression, autoGainControl, advancedNoiseSuppression, voiceFilter, inputGain, inputGate, inputThresholdDb, inputCloseDb, inputHoldMs };
}
export async function configureMicrophone(options: MicrophoneOptions) {
  if (!window.grungusAudio) throw new Error("Microphone processing is unavailable. Please restart Grungus.");
  await window.grungusAudio.configure(options);
}
// Initialize once at the renderer entry point; importing helpers has no side effects.
export function startMicrophonePreferences() {
  const sync = () => { void window.grungusAudio?.configure(microphoneOptions()).catch(error => window.dispatchEvent(new CustomEvent("grungus:audio-warning", { detail: error.message }))); };
  preferences.subscribe(sync);
  sync();
}
