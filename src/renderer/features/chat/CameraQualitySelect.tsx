import { cameraQualityPresets, type CameraQuality } from "../../../domain/calls/CameraQuality";
export function CameraQualitySelect({ value, onChange, disabled = false }: { value: CameraQuality; onChange: (value: CameraQuality) => void; disabled?: boolean }) {
  return <label className="camera-quality"><span>Kamera</span><select aria-label="Kameraqualität" value={value} disabled={disabled} onChange={event => onChange(event.target.value as CameraQuality)}>{Object.entries(cameraQualityPresets).map(([id, preset]) => <option key={id} value={id}>{preset.label}</option>)}</select></label>;
}
