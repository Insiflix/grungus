import { ThemedSelect } from "../../components/common/ThemedSelect";
import { ThemedDatePicker, parseDate } from "../../components/common/ThemedDatePicker";
import { Avatar } from "../../components/common/Avatar";
import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Search, UserRound, Hash, Paperclip, SlidersHorizontal, History, Trash2, ArrowUpRight, X } from "lucide-react";
import type { MatrixMessage, MatrixRoom, MatrixUser } from "../../../domain/matrix/MatrixTypes";
import type { MessageSearchQuery, MessageSearchResults } from "../../../domain/messaging/MessageSearch";
import { activeSearchFilter, parseMessageSearch } from "../../../domain/messaging/MessageSearchInput";
import { useMatrixRuntime } from "../../app/providers/MatrixProvider";

interface SearchProps {
  room: MatrixRoom | null;
  serverName?: string;
  serverRooms: MatrixRoom[];
  historyKey?: string;
  members?: MatrixUser[];
  onOpen: (message: MatrixMessage) => Promise<void>;
}
type SearchMessages = (query: MessageSearchQuery, signal?: AbortSignal, progress?: (result: MessageSearchResults) => void) => Promise<MessageSearchResults>;
function readHistory(key: string): string[] {
  try { const saved: unknown = JSON.parse(sessionStorage.getItem(key) ?? "[]"); return Array.isArray(saved) ? saved.filter((item): item is string => typeof item === "string").slice(0, 5) : []; } catch { return []; }
}

export function MessageSearchField({ room, serverName, serverRooms, historyKey, members = [], onOpen, searchMessages }: SearchProps & { searchMessages: SearchMessages }) {
  const root = useRef<HTMLDivElement>(null), input = useRef<HTMLInputElement>(null), popup = useRef<HTMLDivElement>(null);
  const controller = useRef<AbortController | null>(null);
  const id = useId();
  const [expanded, setExpanded] = useState(false), [advanced, setAdvanced] = useState(false);
  const [scope, setScope] = useState(room ? "room" : "server");
  const [text, setText] = useState(""), [sender, setSender] = useState("");
  const [caret,setCaret] = useState(0), [activeOption,setActiveOption] = useState(0);
  const filter = activeSearchFilter(text,caret);
  const filterOptions: {value:string;label:string;detail:string;avatar?:string|null}[] = (() => {
    if (!filter) return [];
    const query = filter.prefix.toLowerCase();
    if (filter.key === "from") return [...new Map(members.map(member => [member.id,member])).values()].filter(member => `${member.displayName} ${member.id}`.toLowerCase().includes(query)).map(member => ({value:member.id,label:member.displayName,detail:member.id,avatar:member.avatarUrl}));
    if (filter.key === "in") return [...(serverRooms.length ? [{value:"server",label:serverName ?? "Entire server",detail:"All joined channels"}] : []), ...[...new Map([...(room ? [room] : []),...serverRooms].map(item => [item.id,item])).values()].map(item => ({value:item.id,label:item.name,detail:item.id}))].filter(item => `${item.label} ${item.value}`.toLowerCase().includes(query.replace(/^#/,"")));
    if (filter.key === "has") return [{value:"image",label:"Images",detail:"Photos and GIFs"},{value:"video",label:"Videos",detail:"Video attachments"},{value:"audio",label:"Audio",detail:"Audio attachments"},{value:"file",label:"Files",detail:"File attachments"},{value:"link",label:"Links",detail:"Messages containing links"},{value:"media",label:"All attachments",detail:"Images, videos, audio and files"}].filter(item => `${item.value} ${item.label}`.toLowerCase().includes(query));
    return [];
  })().slice(0,40);
  useEffect(() => setActiveOption(0), [filter?.key,filter?.prefix]);
  const [after, setAfter] = useState(""), [before, setBefore] = useState("");
  const [media, setMedia] = useState<NonNullable<MessageSearchQuery["media"]>>("any");
  const [results, setResults] = useState<MessageSearchResults | null>(null);
  const [busy, setBusy] = useState(false), [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState(""), [cancelled, setCancelled] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 340, maxHeight: 500 });
  const storageKey = `grungus.search-history.${historyKey ?? room?.id ?? "rooms"}`;
  const [history, setHistory] = useState(() => readHistory(storageKey));
  const close = () => { controller.current?.abort(); setExpanded(false); setBusy(false); };
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    const field = input.current;
    const focus = (event: Event) => { const requested = (event as CustomEvent).detail?.scope; if (requested === "room" || requested === "server" && serverRooms.length) setScope(requested); setExpanded(true); field?.focus(); };
    field?.addEventListener("grungus:focus-search", focus);
    return () => field?.removeEventListener("grungus:focus-search", focus);
  }, [serverRooms.length]);
  useLayoutEffect(() => {
    if (!expanded) return;
    const place = () => {
      const bounds = root.current?.getBoundingClientRect(); if (!bounds) return;
      const width = Math.min(360, window.innerWidth - 16), top = bounds.bottom + 8;
      setPosition({ width, top, left: Math.max(8, Math.min(bounds.right - width, window.innerWidth - width - 8)), maxHeight: Math.max(100, Math.min(540, window.innerHeight - top - 12)) });
    };
    place(); window.addEventListener("resize", place); window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [expanded]);
  useEffect(() => {
    if (!expanded) return;
    const inside = (target: EventTarget | null) => target instanceof Node && (root.current?.contains(target) || popup.current?.contains(target));
    const outside = (event: Event) => { if (!inside(event.target)) close(); };
    const escape = (event: globalThis.KeyboardEvent) => { if (popup.current?.querySelector("[data-themed-overlay]")) return; if (event.target instanceof Element && (event.target.closest("[data-themed-overlay]") || event.target.closest('[aria-haspopup][aria-expanded="true"]:not([data-message-search])'))) return; if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); input.current?.focus(); close(); } };
    document.addEventListener("pointerdown", outside, true); document.addEventListener("focusin", outside, true); document.addEventListener("keydown", escape, true); window.addEventListener("blur", close);
    return () => { document.removeEventListener("pointerdown", outside, true); document.removeEventListener("focusin", outside, true); document.removeEventListener("keydown", escape, true); window.removeEventListener("blur", close); };
  }, [expanded]);
  const remember = (value: string) => {
    if (!value.trim()) return;
    const next = [value, ...history.filter(item => item !== value)].slice(0, 5); setHistory(next);
    try { sessionStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* History is optional. */ }
  };
  const search = async (value = text, event?: FormEvent) => {
    event?.preventDefault(); controller.current?.abort(); setBusy(false); setExpanded(true); setCaret(-1);
    const request = new AbortController(); controller.current = request;
    try {
      const parsed = parseMessageSearch(value);
      const from = parsed.sender ?? sender, fromDate = parsed.after ?? after, throughDate = parsed.before ?? before, kind = parsed.media ?? media;
      if (!parsed.text && !parsed.channel && !from.trim() && !fromDate && !throughDate && kind === "any") throw new Error("Enter search text or choose a filter.");
      const date = (raw: string) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new Error("Use dates in YYYY-MM-DD format."); const value = new Date(`${raw}T00:00:00`); if (!Number.isFinite(value.getTime()) || value.getFullYear() !== Number(raw.slice(0, 4)) || value.getMonth() + 1 !== Number(raw.slice(5, 7)) || value.getDate() !== Number(raw.slice(8, 10))) throw new Error("Enter a valid date."); return value; };
      const start = fromDate ? date(fromDate).getTime() : undefined;
      const endDate = throughDate ? date(throughDate) : null; if (endDate) endDate.setDate(endDate.getDate() + 1);
      const end = endDate?.getTime(); if (start !== undefined && end !== undefined && start >= end) throw new Error("The end date must be on or after the start date.");
      let roomIds = scope === "room" && room ? [room.id] : serverRooms.map(item => item.id);
      if (parsed.channel) {
        if (parsed.channel.toLowerCase() === "server") roomIds = serverRooms.map(item => item.id);
        else {
          const name = parsed.channel.replace(/^#/, "").toLowerCase();
          roomIds = [...new Map([...(room ? [room] : []), ...serverRooms].map(item => [item.id, item])).values()].filter(item => item.id === parsed.channel || item.name.toLowerCase() === name).map(item => item.id);
        }
      }
      if (!roomIds.length) throw new Error("No joined channels match this search scope.");
      setBusy(true); setCancelled(false); setError(""); setResults(null); remember(value);
      const result = await searchMessages({ roomIds, text: parsed.text, sender: from, after: start, before: end, media: kind }, request.signal, progress => { if (!request.signal.aborted) setResults(progress); });
      if (!request.signal.aborted) setResults(result);
    } catch (cause) { if (!request.signal.aborted) setError(cause instanceof Error ? cause.message : "Search failed. Please try again."); }
    finally { if (controller.current === request) setBusy(false); }
  };
  const insertFilter = (token: string) => {
    const next = `${text.trim()}${text.trim() ? " " : ""}${token}`; setText(next); setCaret(next.length); setResults(null); setError("");
    requestAnimationFrame(() => { input.current?.focus(); input.current?.setSelectionRange(next.length, next.length); });
  };
  const chooseFilter = (value: string, complete = true) => {
    if (!filter) return;
    const token = `${filter.key}:${/\s/.test(value) ? JSON.stringify(value) : value}${complete ? " " : ""}`;
    const next = text.slice(0,filter.start) + token + text.slice(filter.end), cursor = filter.start + token.length;
    setText(next); setCaret(cursor); setResults(null); setError("");
    requestAnimationFrame(() => { input.current?.focus(); input.current?.setSelectionRange(cursor,cursor); });
  };
  const open = async (message: MatrixMessage) => {
    setOpening(message.id); setError("");
    try { await onOpen(message); close(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not open this message."); } finally { setOpening(null); }
  };
  return <div ref={root} className="message-search">
    <form className="message-search__field" role="search" onSubmit={event => void search(text, event)}>
      <input ref={input} data-message-search type="search" aria-label="Search message text" placeholder={`Search ${scope === "server" ? serverName ?? "server" : room?.name ?? "messages"}`} value={text} onChange={event => { setText(event.target.value); setCaret(event.target.selectionStart ?? event.target.value.length); if (!event.target.value) { setResults(null); setCancelled(false); setError(""); } setExpanded(true); }} onSelect={event => setCaret(event.currentTarget.selectionStart ?? 0)} onFocus={() => setExpanded(true)} onClick={() => setExpanded(true)} aria-expanded={expanded} aria-controls={expanded ? filter && filterOptions.length ? `${id}-options` : id : undefined} aria-autocomplete="list" aria-activedescendant={expanded && filterOptions[activeOption] ? `${id}-option-${activeOption}` : undefined} onKeyDown={event => {
        if (!filter || !filterOptions.length) return;
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {event.preventDefault();setActiveOption(index => (index+(event.key === "ArrowDown" ? 1 : -1)+filterOptions.length)%filterOptions.length);requestAnimationFrame(() => popup.current?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({block:"nearest"}));}
        else if (event.key === "Enter" || event.key === "Tab") {event.preventDefault();chooseFilter(filterOptions[activeOption]?.value ?? filterOptions[0].value);}
      }} />
      <button type="submit" aria-label="Search" data-tooltip="Search messages (Ctrl+F)"><Search size={16} /></button>
    </form>
    {expanded && createPortal(<div ref={popup} id={id} className="message-search-popover" role="region" aria-label="Message search" style={position}>
      <div className="message-search__section-heading"><span>{filter ? ({from:"From user",in:"In channel",has:"Media type",after:"After date",before:"Before date"}[filter.key]) : results ? "Results" : "Filters"}</span><button type="button" aria-label="Close message search" onClick={close}><X size={14} /></button></div>
      {filter && ["from","in","has"].includes(filter.key) && <div className="message-search__filter-options" role="listbox" id={`${id}-options`} aria-label={filter.key === "from" ? "Users" : filter.key === "in" ? "Channels" : "Media types"}>{filterOptions.map((option,index) => <button type="button" role="option" id={`${id}-option-${index}`} aria-label={`${option.label} ${option.detail}`} aria-selected={index === activeOption} key={option.value} onPointerDown={event => event.preventDefault()} onPointerMove={() => setActiveOption(index)} onClick={() => chooseFilter(option.value)}>{filter.key === "from" ? <Avatar name={option.label} url={option.avatar} size="small" /> : filter.key === "in" ? <Hash size={18} /> : <Paperclip size={18} />}<strong>{option.label}</strong><small>{option.detail}</small></button>)}{!filterOptions.length && <p className="message-search__note">No matching {filter.key === "from" ? "users" : filter.key === "in" ? "channels" : "media types"}. {filter.key === "from" && "You can also enter a Matrix ID directly."}</p>}</div>}
      {filter && ["after","before"].includes(filter.key) && <div className="message-search__filter-date"><ThemedDatePicker aria-label="Filter date" value={filter.prefix} onChange={value => chooseFilter(value,Boolean(parseDate(value)))} /></div>}
      {!filter && !results && !busy && <div className="message-search__suggestions">
        <button type="button" onClick={() => insertFilter("from:")}><UserRound /><span><strong>From a specific user</strong><small>from: user</small></span></button>
        <button type="button" onClick={() => insertFilter("in:")}><Hash /><span><strong>Sent in a specific channel</strong><small>in: channel</small></span></button>
        <button type="button" onClick={() => insertFilter("has:")}><Paperclip /><span><strong>Includes a type of media</strong><small>has: image, video, audio, file or link</small></span></button>
      </div>}
      {!filter && <button type="button" className="message-search__more" aria-expanded={advanced} onClick={() => setAdvanced(!advanced)}><SlidersHorizontal size={17} /><span>{advanced ? "Hide filters" : "More filters"}<small>Dates, sender, media and search scope</small></span></button>}
      {!filter && advanced && <form className="message-search__filters" onSubmit={event => void search(text, event)}>
        <label>Search in<ThemedSelect aria-label="Search scope" value={scope} onChange={event => setScope(event.target.value)}>{room && <option value="room">{room.name}</option>}{!!serverRooms.length && <option value="server">Server: {serverName}</option>}</ThemedSelect></label>
        <label>Sender<input aria-label="Filter by sender" placeholder="Name or @user:server" value={sender} onChange={event => setSender(event.target.value)} /></label>
        <label>From<ThemedDatePicker aria-label="Messages from date" value={after} onChange={setAfter} /></label>
        <label>Through<ThemedDatePicker aria-label="Messages through date" value={before} onChange={setBefore} /></label>
        <label>Media<ThemedSelect aria-label="Filter by media" value={media} onChange={event => setMedia(event.target.value as typeof media)}><option value="any">All messages</option><option value="media">All attachments</option><option value="image">Images</option><option value="video">Videos</option><option value="audio">Audio</option><option value="file">Files</option><option value="link">Links</option></ThemedSelect></label>
        <button type="submit" className="button button--secondary">Apply filters</button>
      </form>}
      {error && <p className="message-search__error" role="alert">{error}</p>}
      {(busy || results || cancelled) && <div className="message-search__status" role="status">{busy ? `Searching… ${results?.scanned ?? 0} events checked` : cancelled ? "Search stopped; results so far" : `${results?.messages.length ?? 0} results`}{busy && <button type="button" onClick={() => { controller.current?.abort(); setBusy(false); setCancelled(true); }}>Stop search</button>}</div>}
      {!!results?.undecryptable && <p className="message-search__note">{results.undecryptable} messages need unavailable encryption keys.</p>}
      {results?.limited && <p className="message-search__note">Up to 500 results. Narrow your filters to search further.</p>}
      {!filter && results && <div className="message-search__results" aria-label="Message search results">{results.messages.map(message => <button type="button" className="message-search__result" key={`${message.roomId}:${message.id}`} disabled={opening !== null} onClick={() => void open(message)}>
        <span className="message-search__meta"><strong>{message.sender.displayName}</strong><span>{serverRooms.find(item => item.id === message.roomId)?.name ?? room?.name}</span><time>{new Date(message.timestamp).toLocaleString()}</time><ArrowUpRight size={14} /></span><span className="message-search__body">{message.body}</span>
      </button>)}{!results.messages.length && !busy && <p>No messages match these filters.</p>}</div>}
      {!filter && !results && !busy && history.length > 0 && <section className="message-search__history"><div className="message-search__section-heading"><span>History</span><button type="button" aria-label="Clear search history" onClick={() => { setHistory([]); try { sessionStorage.removeItem(storageKey); } catch { /* Optional. */ } }}><Trash2 size={14} /></button></div>{history.map(item => <button type="button" key={item} onClick={() => { setText(item); setCaret(item.length+1); void search(item); }}><History size={16} /><span>{item}</span></button>)}</section>}
    </div>, document.body)}
  </div>;
}

export function MessageSearch(props: SearchProps) {
  const runtime = useMatrixRuntime();
  return <MessageSearchField {...props} searchMessages={runtime.searchMessages} />;
}
