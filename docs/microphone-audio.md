# Microphone audio

Voice & video settings now provide a microphone-only test with live mirroring, a peak meter and a local recording of up to 10 seconds. Headphones avoid feedback during mirroring. Recording pauses the mirror; the sample is played back separately. Captures stop on Stop, device changes and closing settings, including permission requests that resolve after closing. Recordings stay in memory and are revoked when settings close.

All microphone captures share `scripts/microphone-processing.js`, loaded before the application and before the isolated Element Call bundle. Screen/system audio bypasses this pipeline. Classic Matrix calls and Element Call therefore use the same processing as the test. Group-call device selection remains in Element Call; select that same microphone for a representative local test. Settings update active processing without rejoining.

Defaults request native WebRTC echo cancellation, noise suppression, automatic gain, mono capture and 48 kHz. A 75 Hz high-pass filter reduces rumble and a compressor limits loud peaks. Gain is adjustable from 0–200%. Existing saved choices are preserved; Restore recommended audio resets processing choices. Actual native constraints depend on the browser and device.

Optional RNNoise uses `@sapphi-red/web-noise-suppressor` (MIT; RNNoise worklet incorporates the Apache-2.0 licensed shiguredo WASM build). All library, worklet and WASM files ship locally. Native noise suppression is bypassed while RNNoise runs to avoid double filtering. Initialization/processor failures warn and fall back to standard noise suppression. RNNoise stays off by default because extra suppression can affect clean speech and music.

The local preview includes outgoing processing, but cannot reproduce codec artifacts, packet loss, the remote volume or remote hardware. Subjective quality still needs a listening check in a real two-person call.

Research:

- [Discord Social SDK voice processing](https://github.com/discord/discord-api-docs/blob/main/developers/discord-social-sdk/development-guides/managing-voice-chat.mdx): WebRTC defaults plus optional Krisp.
- [Discord Krisp FAQ](https://support.discord.com/hc/en-us/articles/360040843952-Krisp-FAQ): local neural noise cancellation; can reduce quality in quiet environments.
- [web-noise-suppressor](https://github.com/sapphi-red/web-noise-suppressor): RNNoise AudioWorklet, requires 48 kHz.

Validation: `npm test -- --maxWorkers=4`, `npm run build:app`, `npm run test:call`, `npm run test:microphone`, `npm run test:security`. The microphone smoke test uses an invisible Electron window with synthetic audio and Chromium fake capture: it measures outgoing signal/gain, loads the real RNNoise worklet/WASM under CSP, checks clone cleanup and exercises the actual settings mirror, recording playback and stopping capture. It saves `artifacts/microphone-settings.png`.
