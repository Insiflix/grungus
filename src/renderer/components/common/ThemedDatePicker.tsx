import { useId, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { ThemedPopover } from "./ThemedPopover";
import { ThemedSelect } from "./ThemedSelect";

export function dateKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`; }
export function parseDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T12:00:00`);
  return Number.isFinite(date.getTime()) && dateKey(date) === value ? date : null;
}
export function ThemedDatePicker({value, onChange, "aria-label": label, disabled}: {value: string; onChange: (value: string) => void; "aria-label": string; disabled?: boolean}) {
  const [focused,setFocused] = useState(value), [open, setOpen] = useState(false), [month, setMonth] = useState(() => parseDate(value) ?? new Date());
  const anchor = useRef<HTMLSpanElement>(null), calendarButton = useRef<HTMLButtonElement>(null), id = useId();
  const selected = parseDate(value), today = dateKey(new Date());
  const focusDay = (date: Date) => { setFocused(dateKey(date)); setMonth(date); requestAnimationFrame(() => document.getElementById(`${id}-${dateKey(date)}`)?.focus()); };
  const choose = (date: Date) => { onChange(dateKey(date)); setOpen(false); calendarButton.current?.focus(); };
  const start = new Date(month.getFullYear(),month.getMonth(),1,12); start.setDate(start.getDate() - (start.getDay()+6)%7);
  const days = Array.from({length:42},(_,index) => { const day = new Date(start); day.setDate(start.getDate()+index); return day; });
  const tabDay = days.some(day => dateKey(day) === focused) ? focused : dateKey(new Date(month.getFullYear(),month.getMonth(),1,12));
  const changeMonth = (delta: number) => setMonth(new Date(month.getFullYear(),month.getMonth()+delta,1,12));
  return <span className="themed-date-field"><span ref={anchor} className="themed-date">
    <input type="text" inputMode="numeric" aria-label={label} placeholder="YYYY-MM-DD" value={value} disabled={disabled} onChange={event => onChange(event.target.value)} />
    <button ref={calendarButton} type="button" aria-label={`Choose ${label.toLowerCase()}`} disabled={disabled} aria-expanded={open} aria-haspopup="dialog" onClick={() => { if (open) setOpen(false); else { const day = selected ?? new Date(); setFocused(dateKey(day)); setMonth(day); setOpen(true); requestAnimationFrame(() => document.getElementById(`${id}-${dateKey(day)}`)?.focus()); } }}><CalendarDays size={16} /></button>
    {open && <ThemedPopover anchor={anchor} onClose={() => setOpen(false)} role="dialog" label={`${label} calendar`} width={290} className="themed-calendar">
      <div className="themed-calendar__header"><button type="button" aria-label="Previous month" onClick={() => changeMonth(-1)}><ChevronLeft size={16} /></button><ThemedSelect aria-label="Calendar month" value={month.getMonth()} onChange={event => setMonth(new Date(month.getFullYear(),Number(event.target.value),1,12))}>{Array.from({length:12},(_,i) => <option key={i} value={i}>{new Date(2024,i,1).toLocaleString(undefined,{month:"long"})}</option>)}</ThemedSelect><ThemedSelect aria-label="Calendar year" value={month.getFullYear()} onChange={event => setMonth(new Date(Number(event.target.value),month.getMonth(),1,12))}>{Array.from({length:201},(_,i) => new Date().getFullYear()-100+i).map(year => <option key={year} value={year}>{year}</option>)}</ThemedSelect><button type="button" aria-label="Next month" onClick={() => changeMonth(1)}><ChevronRight size={16} /></button></div>
      <div className="themed-calendar__weekdays" aria-hidden="true">{["Mo","Tu","We","Th","Fr","Sa","Su"].map(day => <span key={day}>{day}</span>)}</div>
      <div className="themed-calendar__days" role="grid" aria-label={month.toLocaleString(undefined,{month:"long",year:"numeric"})}>{Array.from({length:6},(_,week) => <div role="row" className="themed-calendar__week" key={week}>{days.slice(week*7,week*7+7).map(day => <button type="button" role="gridcell" id={`${id}-${dateKey(day)}`} key={dateKey(day)} aria-label={day.toLocaleDateString(undefined,{dateStyle:"full"})} aria-selected={dateKey(day) === value} aria-current={dateKey(day) === today ? "date" : undefined} tabIndex={dateKey(day) === tabDay ? 0 : -1} onFocus={() => setFocused(dateKey(day))} className={day.getMonth() !== month.getMonth() ? "is-outside" : ""} onClick={() => choose(day)} onKeyDown={event => {
        const offsets: Record<string,number> = {ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7};
        const next = new Date(day);
        if (event.key in offsets) next.setDate(next.getDate()+offsets[event.key]);
        else if(event.key === "PageUp" || event.key === "PageDown") { next.setDate(1); next.setMonth(next.getMonth()+(event.key === "PageUp" ? -1 : 1)); }
        else if(event.key === "Home") next.setDate(next.getDate()-(next.getDay()+6)%7);
        else if(event.key === "End") next.setDate(next.getDate()+6-(next.getDay()+6)%7);
        else return;
        event.preventDefault(); focusDay(next);
      }}>{day.getDate()}</button>)}</div>)}</div>
      <footer><button type="button" onClick={() => { onChange(""); setOpen(false); calendarButton.current?.focus(); }}>Clear</button><button type="button" onClick={() => choose(new Date())}>Today</button></footer>
    </ThemedPopover>}
  </span></span>;
}
