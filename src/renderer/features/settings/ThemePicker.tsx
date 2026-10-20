import { Check } from "lucide-react";
import { themes, type Theme } from "../../../domain/settings/Themes";

export function ThemePicker({value,onChange}: {value:Theme;onChange:(theme:Theme)=>void}) {
  return <div className="settings-theme-options" role="group" aria-label="App theme">{themes.map(theme => <button type="button" key={theme.id} className={`settings-theme settings-theme--${theme.id}`} aria-label={theme.name} aria-pressed={value === theme.id} onClick={() => onChange(theme.id)}>
    <span className="theme-preview" data-theme-preview={theme.id} aria-hidden="true"><span className="theme-preview__sidebar"><i /><i /><i /></span><span className="theme-preview__chat"><i /><i /><i /></span>{value === theme.id && <Check className="theme-preview__check" size={18} />}</span>
    <strong>{theme.name}</strong><small>{theme.description}</small>
  </button>)}</div>;
}
