import { visibleEmojiRows } from "./EmojiVirtualization";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { emojiCategories, getEmoji, nativeEmoji, searchEmojis } from "../../../domain/messaging/Emojis";
import type { Emoji } from "@emoji-mart/data";

const labels: Record<string, [string, string]> = {
  frequent: ["✨", "Häufig verwendet"], people: ["😀", "Smileys & Menschen"], nature: ["🌿", "Tiere & Natur"],
  foods: ["🍕", "Essen & Trinken"], activity: ["⚽", "Aktivitäten"], places: ["🚀", "Reisen & Orte"],
  objects: ["💡", "Objekte"], symbols: ["❤️", "Symbole"], flags: ["🏳️", "Flaggen"],
};
export function EmojiPicker({ onPick, onClose }: { onPick: (emoji: string) => void; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("frequent");
  const [skin, setSkin] = useState(0);
  const [hovered, setHovered] = useState<Emoji | null>(null);
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  const emojis = useMemo(() => query.trim() ? searchEmojis(query, 200) : category === "frequent" ? searchEmojis("", 40) :
    (emojiCategories.find((item) => item.id === category)?.emojis ?? []).map(getEmoji).filter((emoji): emoji is Emoji => Boolean(emoji)), [query, category]);
  const pick = useCallback((emoji: Emoji) => { onPick(nativeEmoji(emoji, skin)); onClose(); }, [onPick, onClose, skin]);
  return <dialog ref={dialog} className="gif-picker emoji-picker" aria-labelledby="emoji-picker-title" onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <header className="gif-picker__header"><h2 id="emoji-picker-title">Emojis</h2><span>Mit :name: auch direkt tippen</span><button type="button" className="icon-button" aria-label="Emoji-Auswahl schließen" onClick={onClose}><X /></button></header>
    <div className="gif-picker__search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Emojis suchen" aria-label="Emojis suchen" autoFocus /></div>
    <nav className="emoji-categories" aria-label="Emoji-Kategorien">{["frequent", ...emojiCategories.map((item) => item.id)].map((id) => <button type="button" key={id} title={labels[id]?.[1]} aria-label={labels[id]?.[1]} aria-pressed={category === id && !query} onClick={() => { setCategory(id); setQuery(""); }}>{labels[id]?.[0]}</button>)}</nav>
    <EmojiGrid key={`${category}:${query}`} emojis={emojis} skin={skin} label={query ? "SUCHERGEBNISSE" : labels[category]?.[1]} onHover={setHovered} onPick={pick} />
    <footer className="emoji-picker__footer"><span>{hovered ? `:${hovered.id}:` : "Wähle ein Emoji"}</span><label>Hautton <select value={skin} onChange={(event) => setSkin(Number(event.target.value))} aria-label="Emoji-Hautton">{["✋", "✋🏻", "✋🏼", "✋🏽", "✋🏾", "✋🏿"].map((label, index) => <option key={index} value={index}>{label}</option>)}</select></label></footer>
  </dialog>;
}

const EmojiGrid = memo(function EmojiGrid({ emojis, skin, label, onHover, onPick }: { emojis: Emoji[]; skin: number; label: string; onHover: (emoji: Emoji) => void; onPick: (emoji: Emoji) => void }) {
  const viewport = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [columns, setColumns] = useState(8);
  useEffect(() => {
    const node = viewport.current;
    if (!node) return;
    const observer = new ResizeObserver(() => setColumns(window.matchMedia("(max-width: 480px)").matches ? 7 : 8));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const range = visibleEmojiRows(emojis.length, Math.max(0, scrollTop - 30), columns);
  return <div ref={viewport} className="emoji-picker__scroll" onScroll={event => setScrollTop(event.currentTarget.scrollTop)}><div className="gif-picker__section">{label}</div><div className="emoji-grid" style={{ gridTemplateColumns: `repeat(${columns},minmax(0,1fr))`, paddingTop: range.top, paddingBottom: range.bottom }}>{emojis.slice(range.start, range.end).map(emoji => <button type="button" key={emoji.id} title={`:${emoji.id}:`} aria-label={`${emoji.name} :${emoji.id}:`} onMouseEnter={() => onHover(emoji)} onFocus={() => onHover(emoji)} onClick={() => onPick(emoji)}>{nativeEmoji(emoji, skin)}</button>)}</div>{!emojis.length && <p className="gif-picker__state">Keine Emojis gefunden.</p>}</div>;
});