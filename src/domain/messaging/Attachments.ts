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
}
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function attachmentSizeWarning(file: { name: string; size: number }, limit: number): string {
  return `${file.name} is too large (${formatFileSize(file.size)}). This server allows up to ${formatFileSize(limit)} per file.`;
}
