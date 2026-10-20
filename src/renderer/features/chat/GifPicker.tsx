import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Search, Settings2, X } from "lucide-react";
import { KlipyClient, hasDefaultKlipyKey, readKlipyKey, saveKlipyKey, type GifResult } from "../../../infrastructure/gifs/KlipyClient";
import { gifPageCache } from "./GifPageCache";
import { useGifFavorites } from "./GifFavorites";
import { GifFavoriteFrame } from "./GifFavoriteFrame";

export function GifPicker({ onSend, onClose }: { onSend: (url: string) => Promise<void>; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [apiKey, setApiKey] = useState(readKlipyKey);
  const [keyInput, setKeyInput] = useState("");
  const [settings, setSettings] = useState(!apiKey);
  const [tab, setTab] = useState<"search" | "favorites">("search");
  const { favorites } = useGifFavorites();
  const [query, setQuery] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [results, setResults] = useState<GifResult[]>(() => gifPageCache.get(apiKey, "")?.results ?? []);
  const [next, setNext] = useState<string | null>(() => gifPageCache.get(apiKey, "")?.next ?? null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const handledRetry = useRef(0);
  const sendLock = useRef(false);
  const request = useRef<AbortController | null>(null);
  const client = useMemo(() => new KlipyClient(apiKey), [apiKey]);

  useEffect(() => {
    const element = dialog.current; element?.showModal();
    return () => { element?.close(); request.current?.abort(); };
  }, []);

  useEffect(() => {
    request.current?.abort();
    setNext(null); setError(null);
    if (!apiKey || settings || tab === "favorites") { setLoading(false); return; }
    const term = query.trim();
    const retrying = handledRetry.current !== retry;
    handledRetry.current = retry;
    const cached = retrying ? undefined : gifPageCache.get(apiKey, term);
    if (cached) {
      setResults(cached.results); setNext(cached.next); setActiveQuery(term); setLoading(false);
      return;
    }
    const controller = new AbortController(); request.current = controller;
    setLoading(true);
    const search = () => {
      void client.search(term, undefined, controller.signal).then((page) => {
        if (!controller.signal.aborted) {
          gifPageCache.set(apiKey, term, page);
          setResults(page.results); setNext(page.next); setActiveQuery(term);
        }
      }).catch((cause) => { if (!controller.signal.aborted) { setResults([]); setError(cause instanceof Error ? cause.message : "GIF-Suche fehlgeschlagen."); } })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    };
    // Trending and cache hits are immediate; only network searches wait for typing to pause.
    const timer = term ? window.setTimeout(search, 150) : undefined;
    if (!term) search();
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query, apiKey, client, settings, retry, tab]);

  const more = async () => {
    if (!next || loading || sending) return;
    const position = next;
    const controller = new AbortController(); request.current = controller;
    setLoading(true); setError(null);
    try {
      const page = await client.search(activeQuery, position, controller.signal);
      if (!controller.signal.aborted) {
        setResults((current) => [...current, ...page.results.filter((gif) => !current.some((existing) => existing.id === gif.id))]);
        setNext(page.next === position ? null : page.next);
      }
    } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "GIFs konnten nicht geladen werden."); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  };
  const choose = async (gif: GifResult) => {
    if (sendLock.current) return;
    sendLock.current = true; setSending(true); setError(null);
    try {
      await onSend(gif.url);
      if (apiKey && gif.id !== gif.url) void client.registerShare(gif.id, tab === "favorites" ? "" : activeQuery).catch(() => undefined);
      onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "GIF konnte nicht gesendet werden. Bitte erneut versuchen."); }
    finally { sendLock.current = false; setSending(false); }
  };
  const configure = (event: FormEvent) => {
    event.preventDefault(); const key = keyInput.trim(); if (!key) return;
    saveKlipyKey(key); setApiKey(key); setKeyInput(""); setSettings(false);
  };

  return <dialog ref={dialog} className="gif-picker" aria-labelledby="gif-picker-title" onClick={event => {
    if (sending || event.target !== event.currentTarget) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
  }} onCancel={(event) => { event.preventDefault(); if (!sending) onClose(); }}>
    <header className="gif-picker__header"><h2 id="gif-picker-title">GIFs</h2><span>Powered by KLIPY</span>
      {!hasDefaultKlipyKey() && <button type="button" className="icon-button" aria-label="KLIPY einrichten" disabled={sending} onClick={() => setSettings((current) => !current)}><Settings2 /></button>}
      <button type="button" className="icon-button" aria-label="GIF-Suche schließen" disabled={sending} onClick={onClose}><X /></button>
    </header>
    <div className="gif-picker__tabs" role="tablist" aria-label="GIF categories" onKeyDown={event => {
      if (sending || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const nextTab = event.key === "Home" ? "search" : event.key === "End" ? "favorites" : tab === "search" ? "favorites" : "search";
      setTab(nextTab); setError(null);
      event.currentTarget.querySelector<HTMLButtonElement>(`#gif-${nextTab === "search" ? "search" : "favorites"}-tab`)?.focus();
    }}>
      <button type="button" role="tab" id="gif-search-tab" aria-selected={tab === "search"} aria-controls="gif-search-panel" tabIndex={tab === "search" ? 0 : -1} disabled={sending} onClick={() => { setTab("search"); setError(null); }}>Search</button>
      <button type="button" role="tab" id="gif-favorites-tab" aria-selected={tab === "favorites"} aria-controls="gif-favorites-panel" tabIndex={tab === "favorites" ? 0 : -1} disabled={sending} onClick={() => { setTab("favorites"); setError(null); }}>Favourites</button>
    </div>
    {tab === "favorites" ? <div id="gif-favorites-panel" role="tabpanel" aria-labelledby="gif-favorites-tab" className="gif-picker__scroll">
      {error && <p className="gif-picker__state" role="alert">{error}</p>}
      <div className="gif-picker__grid">{favorites.map(gif => <GifFavoriteFrame key={gif.url} gif={gif} className="gif-picker__tile">
        <button type="button" className="gif-picker__result" data-tooltip={`${gif.title} senden`} aria-label={`${gif.title} senden`} disabled={sending} onClick={() => void choose(gif)} style={{ aspectRatio: `${gif.width} / ${gif.height}` }}>
          <img src={gif.previewUrl} alt={gif.title} loading="lazy" decoding="async" referrerPolicy="no-referrer" /><span>{gif.title}</span>
        </button>
      </GifFavoriteFrame>)}</div>
      {favorites.length === 0 && <p className="gif-picker__state">No favourite GIFs yet. Hover over a GIF and click the star to save it here.</p>}
      {sending && <p className="gif-picker__state" role="status">GIF wird gesendet…</p>}
    </div> : settings ? <form id="gif-search-panel" role="tabpanel" aria-labelledby="gif-search-tab" className="gif-picker__settings auth-form" onSubmit={configure}>
      <h3>KLIPY verbinden</h3><p>Hinterlege deinen KLIPY API-Key, um GIFs direkt hier zu suchen.</p>
      <label htmlFor="klipy-key">KLIPY API-Key</label><input id="klipy-key" type="password" value={keyInput} onChange={(event) => setKeyInput(event.target.value)} autoComplete="off" autoFocus placeholder={apiKey ? "Neuen API-Key eingeben" : "API-Key eingeben"} required />
      <button type="submit" className="button button--compact" disabled={!keyInput.trim()}>Speichern & suchen</button>
      <a href="https://partner.klipy.com" target="_blank" rel="noreferrer">API-Key bei KLIPY erstellen</a>
      {apiKey && <button type="button" className="back-button" onClick={() => setSettings(false)}>Zurück zu den GIFs</button>}
    </form> : <div id="gif-search-panel" role="tabpanel" aria-labelledby="gif-search-tab" className="gif-picker__search-panel">
      <div className="gif-picker__search"><Search size={17} /><input aria-label="GIFs suchen" placeholder="GIFs auf KLIPY suchen" value={query} disabled={sending} autoFocus onChange={(event) => setQuery(event.target.value)} />
        {query && <button type="button" className="icon-button" aria-label="Suche leeren" disabled={sending} onClick={() => setQuery("")}><X size={14} /></button>}
      </div>
      <div className="gif-picker__scroll" aria-busy={loading || sending}>
        <div className="gif-picker__section">{query.trim() ? "SUCHERGEBNISSE" : "GERADE BELIEBT"}</div>
        {error && <div className="gif-picker__state" role="alert"><p>{error}</p><button type="button" className="button button--compact" disabled={loading || sending} onClick={() => setRetry((value) => value + 1)}>Erneut versuchen</button></div>}
        <div className="gif-picker__grid">{results.map((gif, index) => <GifFavoriteFrame key={gif.id} gif={gif} className="gif-picker__tile"><button type="button" className="gif-picker__result" data-tooltip={`${gif.title} senden`} aria-label={`${gif.title} senden`} disabled={sending || loading} onClick={() => void choose(gif)} style={{ aspectRatio: `${gif.width} / ${gif.height}` }}>
          <img src={gif.previewUrl} alt={gif.title} loading={index < 6 ? "eager" : "lazy"} decoding="async" referrerPolicy="no-referrer" /><span>{gif.title}</span>
        </button></GifFavoriteFrame>)}</div>
        {loading && <div className="gif-picker__state" role="status">GIFs werden geladen…</div>}
        {sending && <div className="gif-picker__state" role="status">GIF wird gesendet…</div>}
        {!loading && !error && results.length === 0 && <div className="gif-picker__state">Keine GIFs gefunden. Probiere einen anderen Suchbegriff.</div>}
        {next && <button type="button" className="gif-picker__more" disabled={loading || sending} onClick={() => void more()}>Mehr GIFs laden</button>}
      </div>
      <footer className="gif-picker__footer">GIF anklicken zum Senden <a href="https://klipy.com" target="_blank" rel="noreferrer">KLIPY</a></footer>
    </div>}
  </dialog>;
}
