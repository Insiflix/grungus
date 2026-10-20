import { useState } from "react";
import { GifFavoriteFrame } from "./GifFavoriteFrame";

export function GifMessage({ url, onLoad }: { url: string; onLoad?: () => void }) {
  const [failed, setFailed] = useState(false);
  const [allowedUrl, setAllowedUrl] = useState<string | null>(null);
  const host = new URL(url).hostname;
  const trusted = ["media.tenor.com", "c.tenor.com", "media.klipy.com", "static.klipy.com", "i.klipy.com"].includes(host);
  return <GifFavoriteFrame className="message-gif" gif={{ id: url, title: "GIF", url, previewUrl: url, width: 240, height: 180 }}>
    {!trusted && allowedUrl !== url ? <button type="button" className="media-play-button" onClick={() => setAllowedUrl(url)}>Load external GIF from {host}</button> : failed ? <a href={url} target="_blank" rel="noreferrer">GIF konnte nicht geladen werden – Link öffnen</a> :
      <a href={url} target="_blank" rel="noreferrer" aria-label="GIF in voller Größe öffnen">
        <img src={url} alt="Geteiltes GIF" loading="lazy" referrerPolicy="no-referrer" onLoad={onLoad} onError={() => { setFailed(true); onLoad?.(); }} />
      </a>}
    {!failed && <span>GIF</span>}
  </GifFavoriteFrame>;
}
