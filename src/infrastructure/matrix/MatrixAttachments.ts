import { readMediaMetadata } from "./MediaMetadata";
import { EventType, MsgType, getHttpUriForMxc, type MatrixClient } from "matrix-js-sdk";
import type { MessageAttachment } from "../../domain/messaging/Attachments";
import type { MatrixSendTextOptions } from "../../domain/matrix/MatrixTypes";
import { encryptAttachment, decryptAttachment } from "./MatrixAttachmentCrypto";
import { checkAttachmentSize } from "./MatrixUploadLimit";
import { attachmentMediaKind, attachmentMimeType } from "../../domain/messaging/Attachments";
import { boundedBlob } from "../http/BoundedResponse";

export async function sendAttachment(client: MatrixClient, roomId: string, file: File, onProgress?: (percent: number) => void, options: MatrixSendTextOptions = {}): Promise<string> {
  await checkAttachmentSize(client, file);
  const encrypted = client.isRoomEncrypted(roomId);
  const mimeType = attachmentMimeType(file.name, file.type);
  const kind = attachmentMediaKind({ name: file.name, mimeType });
  const metadataJob = kind === "video" || kind === "audio" ? readMediaMetadata(file.slice(0, file.size, mimeType), kind).catch(() => ({})) : Promise.resolve({});
  onProgress?.(0);
  const cipher = encrypted ? await encryptAttachment(await file.arrayBuffer()) : null;
  const { content_uri } = await client.uploadContent(cipher ? new Blob([cipher.ciphertext], { type: "application/octet-stream" }) : file, {
    name: encrypted ? "attachment" : file.name,
    type: encrypted ? "application/octet-stream" : mimeType,
    includeFilename: !encrypted,
    progressHandler: progress => onProgress?.(Math.min(99, Math.round(progress.loaded / (progress.total || file.size || 1) * 100))),
  }).catch(error => {
    if (error?.httpStatus === 413 || error?.errcode === "M_TOO_LARGE") throw new Error("The server rejected this file as too large. Its storage or proxy limit may be lower than its advertised upload limit.");
    throw error;
  });
  const metadata: import("./MediaMetadata").MediaMetadata = await metadataJob;
  let thumbnail: Record<string, unknown> = {};
  if (metadata.poster) {
    try {
      const preview = metadata.poster;
      const thumbnailCipher = encrypted ? await encryptAttachment(await preview.arrayBuffer()) : null;
      const upload = await client.uploadContent(thumbnailCipher ? new Blob([thumbnailCipher.ciphertext], { type: "application/octet-stream" }) : preview, { name: encrypted ? "attachment" : "preview.jpg", type: encrypted ? "application/octet-stream" : preview.type, includeFilename: !encrypted });
      thumbnail = {
        thumbnail_info: { mimetype: preview.type, size: preview.size },
        ...(thumbnailCipher ? { thumbnail_file: { ...thumbnailCipher.metadata, url: upload.content_uri } } : { thumbnail_url: upload.content_uri }),
      };
    } catch { /* A missing preview must not prevent sending the original attachment. */ }
  }
  const response = await client.sendEvent(roomId, EventType.RoomMessage, {
    msgtype: kind === "image" ? MsgType.Image : kind === "video" ? MsgType.Video : kind === "audio" ? MsgType.Audio : MsgType.File,
    body: file.name, filename: file.name,
    info: { mimetype: mimeType, size: file.size, ...(metadata.durationMs ? { duration: metadata.durationMs } : {}), ...(metadata.width && metadata.height ? { w: metadata.width, h: metadata.height } : {}), ...thumbnail },
    ...(cipher ? { file: { ...cipher.metadata, url: content_uri } } : { url: content_uri }),
    ...(options.replyToEventId ? { "m.relates_to": { "m.in_reply_to": { event_id: options.replyToEventId } } } : {}),
  });
  onProgress?.(100);
  return response.event_id;
}
export async function loadAttachment(client: MatrixClient, attachment: MessageAttachment, signal?: AbortSignal): Promise<Blob> {
  if (!attachment.url.startsWith("mxc://")) throw new Error("Invalid Matrix attachment URL.");
  const url = getHttpUriForMxc(client.getHomeserverUrl(), attachment.url, undefined, undefined, undefined, false, false, true);
  if (!url) throw new Error("Invalid Matrix attachment URL.");
  const token = client.getAccessToken();
  if (!token) throw new Error("No Matrix session.");
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, credentials: "omit", referrerPolicy: "no-referrer", redirect: "follow", signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(60_000)]) : AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error("Attachment could not be downloaded.");
  const limit = attachment.mimeType.startsWith("image/") ? 32 * 1024 * 1024 : 256 * 1024 * 1024;
  const data = await (await boundedBlob(response, limit)).arrayBuffer();
  return new Blob([attachment.encrypted ? await decryptAttachment(data, attachment.encrypted) : data], { type: attachment.mimeType || "application/octet-stream" });
}
