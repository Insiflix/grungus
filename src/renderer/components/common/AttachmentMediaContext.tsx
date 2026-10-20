import { createContext } from "react";
import type { MessageAttachment } from "../../../domain/messaging/Attachments";

export const AttachmentMediaContext = createContext<(attachment: MessageAttachment, signal?: AbortSignal) => Promise<Blob>>(
  () => Promise.reject(new Error("Media is not connected.")),
);
