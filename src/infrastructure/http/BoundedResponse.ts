/** Never trust an untrusted server's declared media size or buffer an unlimited response. */
export async function boundedBlob(response: Response, maxBytes: number): Promise<Blob> {
  const length = Number(response.headers?.get("content-length"));
  if (Number.isFinite(length) && length > maxBytes) { await response.body?.cancel(); throw new Error("Media exceeds the safe download limit."); }
  if (!response.body) {
    const blob = await response.blob();
    if (blob.size > maxBytes) throw new Error("Media exceeds the safe download limit.");
    return blob;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new Error("Media exceeds the safe download limit."); }
      chunks.push(new Uint8Array(value));
    }
    return new Blob(chunks, { type: response.headers?.get("content-type") ?? "application/octet-stream" });
  } finally { reader.releaseLock(); }
}
