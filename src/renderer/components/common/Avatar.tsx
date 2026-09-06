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
  return (
    <span className={`avatar avatar--${size}`} aria-hidden="true">
      {url ? <img src={url} alt="" loading="lazy" referrerPolicy="no-referrer" /> : initials(name)}
      {status && <span className="avatar__status" />}
    </span>
  );
}
