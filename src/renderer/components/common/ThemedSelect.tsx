import { Children, isValidElement, useEffect, useId, useRef, useState, type ReactNode, type ButtonHTMLAttributes } from "react";
import { Check, ChevronDown } from "lucide-react";
import { ThemedPopover } from "./ThemedPopover";

interface Choice { value: string; label: ReactNode; text: string; disabled: boolean }
function textOf(value: ReactNode): string { return Children.toArray(value).map(item => isValidElement<{children?: ReactNode}>(item) ? textOf(item.props.children) : String(item)).join(""); }
function choices(children: ReactNode): Choice[] {
  return Children.toArray(children).flatMap(item => {
    if (!isValidElement<{value?: string | number; disabled?: boolean; children?: ReactNode}>(item)) return [];
    if (item.type !== "option") return choices(item.props.children);
    return [{value: String(item.props.value ?? textOf(item.props.children)), label: item.props.children, text: textOf(item.props.children), disabled: Boolean(item.props.disabled)}];
  });
}
type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange" | "value" | "defaultValue" | "title"> & {
  "data-tooltip"?: string;
  value?: string | number; defaultValue?: string | number; required?: boolean;
  onChange?: (event: {target: {value: string}; currentTarget: {value: string}}) => void;
};

export function ThemedSelect({ children, value, defaultValue, onChange, disabled, className = "", id, name, required, ...props }: Props) {
  const options = choices(children), generatedId = useId(), listId = `${generatedId}-list`;
  const [local, setLocal] = useState(String(defaultValue ?? options[0]?.value ?? ""));
  const selected = String(value ?? local), index = Math.max(0, options.findIndex(item => item.value === selected));
  const [open, setOpen] = useState(false), [active, setActive] = useState(index);
  const trigger = useRef<HTMLButtonElement>(null), typeahead = useRef({text:"",time:0});
  useEffect(() => {if(open) document.getElementById(`${listId}-${active}`)?.scrollIntoView?.({block:"nearest"});},[open,active,listId]);
  useEffect(() => {if(disabled) setOpen(false);},[disabled]);
  const choose = (option: Choice) => { if (option.disabled) return; setLocal(option.value); onChange?.({target:{value:option.value},currentTarget:{value:option.value}}); setOpen(false); trigger.current?.focus(); };
  const show = () => { setActive(index); setOpen(true); };
  const move = (direction: number) => {
    let next = open ? active : index;
    for (let count = 0; count < options.length; count++) { next = (next + direction + options.length) % options.length; if (!options[next].disabled) break; }
    setActive(next); setOpen(true);
    requestAnimationFrame(() => document.getElementById(`${listId}-${next}`)?.scrollIntoView?.({block:"nearest"}));
  };
  return <span className={`themed-select ${className}`}>
    {name && <input type="hidden" name={name} value={selected} disabled={disabled} />}
    <button {...props} id={id ?? generatedId} ref={trigger} type="button" role="combobox" className="themed-select__trigger" disabled={disabled} aria-required={required || undefined} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listId : undefined} aria-activedescendant={open ? `${listId}-${active}` : undefined}
      onClick={() => open ? setOpen(false) : show()} onKeyDown={event => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); move(event.key === "ArrowDown" ? 1 : -1); }
        else if (event.key === "Home" || event.key === "End") { event.preventDefault(); const enabled = options.map((option,i) => ({option,i})).filter(item => !item.option.disabled); setActive((event.key === "Home" ? enabled[0] : enabled.at(-1))?.i ?? 0); setOpen(true); }
        else if (event.key === "Enter" || event.key === " ") { event.preventDefault(); if (open && options[active]) choose(options[active]); else show(); }
        else if (event.key === "Tab") setOpen(false);
        else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) { const now = Date.now(); typeahead.current = {text:(now - typeahead.current.time < 700 ? typeahead.current.text : "") + event.key.toLowerCase(),time:now}; const match = options.findIndex(option => !option.disabled && option.text.toLowerCase().startsWith(typeahead.current.text)); if (match >= 0) { setActive(match); setOpen(true); } }
      }}><span>{options.find(item => item.value === selected)?.label ?? "Choose an option"}</span><ChevronDown size={14} /></button>
    {open && !disabled && <ThemedPopover anchor={trigger} onClose={() => setOpen(false)} role="listbox" id={listId} label={props["aria-label"] ?? "Options"} className="themed-select__options">{options.map((option,i) => <div key={`${option.value}-${i}`} role="option" id={`${listId}-${i}`} aria-selected={option.value === selected} aria-disabled={option.disabled || undefined} className={`themed-option ${i === active ? "is-active" : ""}`} onPointerDown={event => event.preventDefault()} onPointerMove={() => !option.disabled && setActive(i)} onClick={event => { event.preventDefault(); event.stopPropagation(); choose(option); }}><span>{option.label}</span>{option.value === selected && <Check size={14} />}</div>)}</ThemedPopover>}
  </span>;
}
