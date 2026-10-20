import type { MatrixMessage } from "../matrix/MatrixTypes";
import { attachmentMediaKind } from "./Attachments";
import { parseGifMessage } from "./GifMessage";
export interface MessageSearchQuery {
  roomIds: string[];
  text: string;
  sender?: string;
  after?: number;
  before?: number;
  media?: "any" | "media" | "image" | "video" | "audio" | "file" | "link";
}
export interface MessageSearchResults {
  messages: MatrixMessage[];
  scanned: number;
  roomsDone: number;
  totalRooms: number;
  undecryptable: number;
  limited: boolean;
}
export function matchesMessage(message: MatrixMessage, query: MessageSearchQuery): boolean {
  if (message.isRedacted || message.sendState !== "sent" || ["encrypted", "unsupported"].includes(message.type)) return false;
  if (!query.roomIds.includes(message.roomId)) return false;
  if (query.after !== undefined && message.timestamp < query.after || query.before !== undefined && message.timestamp >= query.before) return false;
  const sender = query.sender?.trim().toLocaleLowerCase();
  if (sender && (sender.startsWith("@") ? message.sender.id.toLocaleLowerCase() !== sender : !`${message.sender.displayName} ${message.sender.id}`.toLocaleLowerCase().includes(sender))) return false;
  const text = `${message.body} ${message.attachment?.name ?? ""}`.toLocaleLowerCase();
  if (!query.text.trim().toLocaleLowerCase().split(/\s+/).every(word => text.includes(word))) return false;
  const media = query.media ?? "any";
  const kind = message.attachment ? attachmentMediaKind(message.attachment) ?? "file" : parseGifMessage(message.body) ? "image" : message.type;
  if (media === "media") return ["image", "video", "audio", "file"].includes(kind);
  if (media === "link") return /https?:\/\//i.test(message.body);
  return media === "any" || kind === media;
}
