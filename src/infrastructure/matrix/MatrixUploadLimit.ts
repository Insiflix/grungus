import type { MatrixClient } from "matrix-js-sdk";
import { attachmentSizeWarning } from "../../domain/messaging/Attachments";

const limits = new WeakMap<MatrixClient, { expires: number; value: Promise<number | null> }>();

/** The server's optional m.upload.size is in bytes. Cache per connected SDK client. */
export function getUploadLimit(client: MatrixClient): Promise<number | null> {
  const cached = limits.get(client);
  if (cached && cached.expires > Date.now()) return cached.value;
  const value = (async () => {
    const config = await client.getMediaConfig(true).catch(error => {
      if ([404, 405].includes(error?.httpStatus) || error?.errcode === "M_UNRECOGNIZED") return client.getMediaConfig(false);
      throw error;
    });
    const size = config["m.upload.size"];
    return typeof size === "number" && Number.isSafeInteger(size) && size >= 0 ? size : null;
  })().catch(error => { limits.delete(client); throw error; });
  limits.set(client, { value, expires: Date.now() + 5 * 60_000 });
  return value;
}

export async function checkAttachmentSize(client: MatrixClient, file: File): Promise<void> {
  const limit = await getUploadLimit(client);
  if (limit !== null && file.size > limit) throw new Error(attachmentSizeWarning(file, limit));
}
