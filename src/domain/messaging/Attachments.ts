export interface EncryptedAttachment {
  url: string;
  key: { alg: string; key_ops: string[]; kty: string; k: string; ext: boolean };
  iv: string;
  hashes: Record<string, string>;
  v: string;
}
export interface MessageAttachment {
  url: string;
  name: string;
  mimeType: string;
  size?: number;
  width?: number;
  height?: number;
  encrypted?: EncryptedAttachment;
  durationMs?: number;
  voice?: boolean;
  waveform?: number[];
  thumbnail?: { url: string; mimeType: string; width?: number; height?: number; encrypted?: EncryptedAttachment };
}
const mediaExtensions: Record<string, string> = {
  mp4: "video/mp4", m4v: "video/mp4", webm: "video/webm", mpg: "video/mpeg", mpeg: "video/mpeg", mov: "video/quicktime", mkv: "video/x-matroska", avi: "video/x-msvideo", ogv: "video/ogg",
  mp3: "audio/mpeg", wav: "audio/wav", wave: "audio/wav", ogg: "audio/ogg", oga: "audio/ogg", opus: "audio/ogg", flac: "audio/flac", m4a: "audio/mp4", aac: "audio/aac", aiff: "audio/aiff", wma: "audio/x-ms-wma",
};
export function attachmentMimeType(name: string, mimeType?: string): string {
  const mime = mimeType?.split(";")[0].trim().toLowerCase();
  return mime && !["application/octet-stream", "binary/octet-stream", "application/ogg"].includes(mime) ? mime : mediaExtensions[name.split(".").at(-1)?.toLowerCase() ?? ""] ?? (mime || "application/octet-stream");
}
export function attachmentMediaKind(attachment: Pick<MessageAttachment, "name" | "mimeType">): "image" | "video" | "audio" | null {
  const mime = attachmentMimeType(attachment.name, attachment.mimeType);
  return mime.startsWith("image/") ? "image" : mime.startsWith("video/") ? "video" : mime.startsWith("audio/") ? "audio" : null;
}
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function attachmentSizeWarning(file: { name: string; size: number }, limit: number): string {
  return `${file.name} is too large (${formatFileSize(file.size)}). This server allows up to ${formatFileSize(limit)} per file.`;
}
