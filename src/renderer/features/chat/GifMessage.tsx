import { useState } from "react";

export function GifMessage({ url, onLoad }: { url: string; onLoad?: () => void }) {
  const [failed, setFailed] = useState(false);
  return <div className="message-gif">
    {failed ? <a href={url} target="_blank" rel="noreferrer">GIF konnte nicht geladen werden – Link öffnen</a> :
      <a href={url} target="_blank" rel="noreferrer" aria-label="GIF in voller Größe öffnen">
        <img src={url} alt="Geteiltes GIF" loading="lazy" referrerPolicy="no-referrer" onLoad={onLoad} onError={() => { setFailed(true); onLoad?.(); }} />
      </a>}
    {!failed && <span>GIF</span>}
  </div>;
}
