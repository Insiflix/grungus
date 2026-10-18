export const cameraQualityPresets = {
  "360p": { label: "360p · 15 FPS", width: 640, height: 360, frameRate: 15 },
  "720p": { label: "720p · 30 FPS", width: 1280, height: 720, frameRate: 30 },
  "1080p": { label: "1080p · 30 FPS", width: 1920, height: 1080, frameRate: 30 },
} as const;
export type CameraQuality = keyof typeof cameraQualityPresets;
export function isCameraQuality(value: unknown): value is CameraQuality { return typeof value === "string" && Object.hasOwn(cameraQualityPresets, value); }
export function cameraConstraints(quality: CameraQuality): MediaTrackConstraints {
  const preset = cameraQualityPresets[quality];
  return { width: { ideal: preset.width, max: preset.width }, height: { ideal: preset.height, max: preset.height }, frameRate: { ideal: preset.frameRate, max: preset.frameRate } };
}
export function loadCameraQuality(): CameraQuality {
  try { const saved = localStorage.getItem("grungus.cameraQuality"); return isCameraQuality(saved) ? saved : "720p"; } catch { return "720p"; }
}
export function saveCameraQuality(quality: CameraQuality) { try { localStorage.setItem("grungus.cameraQuality", quality); } catch {} }
