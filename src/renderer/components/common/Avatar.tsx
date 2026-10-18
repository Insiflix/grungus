import { useContext, useEffect, useState } from "react";
import { AvatarMediaContext } from "./AvatarMediaContext";

interface AvatarProps {
  name: string;
  url?: string | null;
  size?: "small" | "medium" | "large";
  status?: boolean;
}

function initials(name: string): string {
  return name
    .replace(/^[@#!]/, "")
    .split(/[\s:_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "?";
}

export function Avatar({ name, url, size = "medium", status = false }: AvatarProps) {
  const load = useContext(AvatarMediaContext);
  const [image, setImage] = useState<{ url: string; src: string } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    let active = true; setImage(null); setFailed(null);
    if (url) void load(url).then((src) => { if (active) setImage({ url, src }); }).catch(() => { if (active) setFailed(url); });
    return () => { active = false; };
  }, [url, load]);
  const src = image && image.url === url && failed !== url ? image.src : null;
  return (
    <span className={`avatar avatar--${size}`} data-avatar-state={!url ? "missing" : failed === url ? "failed" : src ? "loaded" : "loading"} aria-hidden="true">
      {src ? <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(url ?? null)} /> : initials(name)}
      {status && <span className="avatar__status" />}
    </span>
  );
}
