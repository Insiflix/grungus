import { useState } from "react";
import { GifFavoriteFrame } from "./GifFavoriteFrame";

export function GifMessage({ url, onLoad }: { url: string; onLoad?: () => void }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const failed = failedUrl === url;
  const [allowedUrl, setAllowedUrl] = useState<string | null>(null);
  const host = new URL(url).hostname;
  const trusted = ["media.tenor.com", "c.tenor.com", "media.klipy.com", "static.klipy.com", "i.klipy.com"].includes(host);
  return <GifFavoriteFrame className="message-gif" gif={{ id: url, title: "GIF", url, previewUrl: url, width: 240, height: 180 }}>
    {!trusted && allowedUrl !== url ? <button type="button" className="media-play-button" onClick={() => setAllowedUrl(url)}>Load external GIF from {host}</button> : failed ? <a href={url} target="_blank" rel="noreferrer">Unable to load GIF – open link</a> :
      <a href={url} target="_blank" rel="noreferrer" aria-label="Open full-size GIF">
        <img src={url} alt="Geteiltes GIF" loading="lazy" referrerPolicy="no-referrer" onLoad={onLoad} onError={() => { setFailedUrl(url); onLoad?.(); }} />
      </a>}
    {!failed && <span>GIF</span>}
  </GifFavoriteFrame>;
}
