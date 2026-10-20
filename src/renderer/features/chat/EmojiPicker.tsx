import { ThemedSelect } from "../../components/common/ThemedSelect";
import { visibleEmojiRows } from "./EmojiVirtualization";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { Search, X } from "lucide-react";
import { emojiCategories, getEmoji, nativeEmoji, searchEmojis } from "../../../domain/messaging/Emojis";
import type { Emoji } from "@emoji-mart/data";
import sprites from "./EmojiSprites.json";

const positions: Record<string, number[]> = sprites.positions;
function EmojiGlyph({ emoji, skin }: { emoji: Emoji; skin: number }) {
  const variant = emoji.skins[skin] ?? emoji.skins[0];
  const position = positions[variant.unified];
  return position ? <span aria-hidden="true" className="emoji-glyph" style={{
    backgroundPosition: `${position[0] / (sprites.cols - 1) * 100}% ${position[1] / (sprites.rows - 1) * 100}%`,
    backgroundSize: `${sprites.cols * 100}% ${sprites.rows * 100}%`,
  }} /> : <span aria-hidden="true">{variant.native}</span>;
}

const labels: Record<string, [string, string]> = {
  frequent: ["✨", "Häufig verwendet"], people: ["😀", "Smileys & Menschen"], nature: ["🌿", "Tiere & Natur"],
  foods: ["🍕", "Essen & Trinken"], activity: ["⚽", "Aktivitäten"], places: ["🚀", "Reisen & Orte"],
  objects: ["💡", "Objekte"], symbols: ["❤️", "Symbole"], flags: ["🏳️", "Flaggen"],
};
export function EmojiPicker({ onPick, onClose }: { onPick: (emoji: string) => void; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const startedOutside = useRef(false);
  const outsideDialog = (event: { target: EventTarget; currentTarget: HTMLDialogElement; clientX: number; clientY: number }) => {
    if (event.target !== event.currentTarget) return false;
    const bounds = event.currentTarget.getBoundingClientRect();
    return event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom;
  };
  const handlePointerDown = (event: PointerEvent<HTMLDialogElement>) => {
    startedOutside.current = outsideDialog(event);
  };
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("frequent");
  const [skin, setSkin] = useState(0);
  const [hovered, setHovered] = useState<Emoji | null>(null);
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  const emojis = useMemo(() => query.trim() ? searchEmojis(query, 200) : category === "frequent" ? searchEmojis("", 40) :
    (emojiCategories.find((item) => item.id === category)?.emojis ?? []).map(getEmoji).filter((emoji): emoji is Emoji => Boolean(emoji)), [query, category]);
  const pick = useCallback((emoji: Emoji) => { onPick(nativeEmoji(emoji, skin)); onClose(); }, [onPick, onClose, skin]);
  return <dialog ref={dialog} className="gif-picker emoji-picker" aria-labelledby="emoji-picker-title" onPointerDown={handlePointerDown} onClick={(event) => {
    if (startedOutside.current && outsideDialog(event)) onClose();
    startedOutside.current = false;
  }} onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <header className="gif-picker__header"><h2 id="emoji-picker-title">Emojis</h2><span>Mit :name: auch direkt tippen</span><button type="button" className="icon-button" aria-label="Emoji-Auswahl schließen" onClick={onClose}><X /></button></header>
    <div className="gif-picker__search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Emojis suchen" aria-label="Emojis suchen" autoFocus /></div>
    <nav className="emoji-categories" aria-label="Emoji-Kategorien">{["frequent", ...emojiCategories.map((item) => item.id)].map((id) => <button type="button" key={id} data-tooltip={labels[id]?.[1]} aria-label={labels[id]?.[1]} aria-pressed={category === id && !query} onClick={() => { setCategory(id); setQuery(""); }}>{labels[id]?.[0]}</button>)}</nav>
    <EmojiGrid emojis={emojis} skin={skin} label={query ? "SUCHERGEBNISSE" : labels[category]?.[1]} onHover={setHovered} onPick={pick} />
    <footer className="emoji-picker__footer"><span>{hovered ? `:${hovered.id}:` : "Wähle ein Emoji"}</span><label>Hautton <ThemedSelect value={skin} onChange={(event) => setSkin(Number(event.target.value))} aria-label="Emoji-Hautton">{["✋", "✋🏻", "✋🏼", "✋🏽", "✋🏾", "✋🏿"].map((label, index) => <option key={index} value={index}>{label}</option>)}</ThemedSelect></label></footer>
  </dialog>;
}

const EmojiGrid = memo(function EmojiGrid({ emojis, skin, label, onHover, onPick }: { emojis: Emoji[]; skin: number; label: string; onHover: (emoji: Emoji) => void; onPick: (emoji: Emoji) => void }) {
  const viewport = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [columns, setColumns] = useState(8);
  useLayoutEffect(() => {
    if (viewport.current) viewport.current.scrollTop = 0;
    setScrollTop(0);
  }, [emojis]);
  useEffect(() => {
    const node = viewport.current;
    if (!node) return;
    const observer = new ResizeObserver(() => setColumns(window.matchMedia("(max-width: 480px)").matches ? 7 : 8));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const range = visibleEmojiRows(emojis.length, Math.max(0, scrollTop - 30), columns);
  return <div ref={viewport} className="emoji-picker__scroll" onScroll={event => setScrollTop(event.currentTarget.scrollTop)}><div className="gif-picker__section">{label}</div><div className="emoji-grid" style={{ gridTemplateColumns: `repeat(${columns},minmax(0,1fr))`, paddingTop: range.top, paddingBottom: range.bottom }}>{emojis.slice(range.start, range.end).map((emoji, slot) => <button type="button" key={slot} data-tooltip={`:${emoji.id}:`} aria-label={`${emoji.name} :${emoji.id}:`} onMouseEnter={() => onHover(emoji)} onFocus={() => onHover(emoji)} onClick={() => onPick(emoji)}><EmojiGlyph emoji={emoji} skin={skin} /></button>)}</div>{!emojis.length && <p className="gif-picker__state">Keine Emojis gefunden.</p>}</div>;
});
