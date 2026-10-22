import { ThemedSelect } from "../../components/common/ThemedSelect";
﻿import { cameraQualityPresets, type CameraQuality } from "../../../domain/calls/CameraQuality";
export function CameraQualitySelect({ value, onChange, disabled = false }: { value: CameraQuality; onChange: (value: CameraQuality) => void; disabled?: boolean }) {
  return <label className="camera-quality"><span>Camera</span><ThemedSelect aria-label="Camera quality" value={value} disabled={disabled} onChange={event => onChange(event.target.value as CameraQuality)}>{Object.entries(cameraQualityPresets).map(([id, preset]) => <option key={id} value={id}>{preset.label}</option>)}</ThemedSelect></label>;
}
