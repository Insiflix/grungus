import { useId, useRef, useState, type InputHTMLAttributes } from "react";
import { ThemedPopover } from "./ThemedPopover";

export function ThemedAutocomplete({options,value,onChange,...props}: Omit<InputHTMLAttributes<HTMLInputElement>,"value"|"onChange"|"list"> & {value:string;onChange:(value:string)=>void;options:{value:string;label:string;detail?:string}[]}) {
  const [open,setOpen] = useState(false), [active,setActive] = useState(0), anchor = useRef<HTMLInputElement>(null), id = useId();
  const filtered = options.filter(item => `${item.label} ${item.value}`.toLowerCase().includes(value.toLowerCase())).slice(0,40);
  const choose = (next:string) => { onChange(next);anchor.current?.focus();setOpen(false); };
  return <span className="themed-autocomplete"><input {...props} value={value} onChange={event => {onChange(event.target.value);setOpen(true);setActive(0);}} ref={anchor} role="combobox" autoComplete="off" aria-autocomplete="list" aria-expanded={open && !!filtered.length} aria-controls={open && filtered.length ? id : undefined} aria-activedescendant={open && filtered[active] ? `${id}-${active}` : undefined} onFocus={() => setOpen(true)} onKeyDown={event => {
    if(event.key === "ArrowDown" || event.key === "ArrowUp") {event.preventDefault();setOpen(true);setActive(index => (index+(event.key === "ArrowDown" ? 1 : -1)+filtered.length)%Math.max(1,filtered.length));}
    else if(event.key === "Enter" && open && filtered[active]) {event.preventDefault();choose(filtered[active].value);}
    else if(event.key === "Tab") setOpen(false);
  }} />{open && !!filtered.length && <ThemedPopover anchor={anchor} onClose={() => setOpen(false)} role="listbox" id={id} label="Suggestions">{filtered.map((item,index) => <div role="option" id={`${id}-${index}`} aria-selected={index===active} className={`themed-option ${index===active ? "is-active" : ""}`} key={item.value} onPointerDown={event => event.preventDefault()} onClick={event => {event.preventDefault();choose(item.value);}}><span><strong>{item.label}</strong><small>{item.detail ?? item.value}</small></span></div>)}</ThemedPopover>}</span>;
}
