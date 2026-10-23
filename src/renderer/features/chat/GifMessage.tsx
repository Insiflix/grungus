import { useState } from "react";
import { GifFavoriteFrame } from "./GifFavoriteFrame";
import type { MatrixUser } from "../../../domain/matrix/MatrixTypes";
import { ImageViewer } from "./ImageViewer";
import { copyImage } from "./copyImage";

export function GifMessage({ url, onLoad, sender, timestamp }: { url: string; onLoad?: () => void; sender?: MatrixUser; timestamp?: number }) {
  const [viewing, setViewing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const failed = failedUrl === url;
  const [allowedUrl, setAllowedUrl] = useState<string | null>(null);
  const host = new URL(url).hostname;
  const trusted = ["media.tenor.com", "c.tenor.com", "media.klipy.com", "static.klipy.com", "i.klipy.com"].includes(host);
  const blob = async () => {
    const response = await fetch(url, { referrerPolicy: "no-referrer", credentials: "omit" });
    if (!response.ok) throw new Error("Unable to load GIF.");
    return response.blob();
  };
  const download = async () => {
    if (downloading) return;
    setDownloading(true); setError("");
    try {
      const src = URL.createObjectURL(await blob());
      const anchor = document.createElement("a");
      anchor.href = src; anchor.download = "GIF.gif"; anchor.click();
      setTimeout(() => URL.revokeObjectURL(src), 1000);
    } catch { setError("GIF could not be downloaded. Please try again."); }
    finally { setDownloading(false); }
  };
  const copy = async () => {
    setError("");
    try { await copyImage(await blob()); }
    catch { setError("GIF image could not be copied. Please try again."); }
  };
  const copyLink = async () => {
    setError("");
    try {
      if (window.desktop?.clipboard) await window.desktop.clipboard.writeText(url);
      else await navigator.clipboard.writeText(url);
    } catch { setError("GIF link could not be copied."); }
  };
  return <><GifFavoriteFrame className="message-gif" gif={{ id: url, title: "GIF", url, previewUrl: url, width: 240, height: 180 }}>
    {!trusted && allowedUrl !== url ? <button type="button" className="media-play-button" onClick={() => setAllowedUrl(url)}>Load external GIF from {host}</button> : failed ? <a href={url} target="_blank" rel="noreferrer">Unable to load GIF – open link</a> :
      <button type="button" className="message-gif__preview" aria-label="Open full-size GIF" onClick={() => { setError(""); setViewing(true); }}>
        <img src={url} alt="Geteiltes GIF" loading="lazy" referrerPolicy="no-referrer" onLoad={onLoad} onError={() => { setFailedUrl(url); onLoad?.(); }} />
      </button>}
    {!failed && <span>GIF</span>}
  </GifFavoriteFrame>
    {viewing && <ImageViewer src={url} name="GIF" sender={sender} timestamp={timestamp} onClose={() => setViewing(false)} onDownload={() => void download()} onCopy={() => void copy()} onCopyLink={() => void copyLink()} downloading={downloading} error={error} />}
  </>;
}
