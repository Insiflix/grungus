import { clipboard, ClipboardItem, nativeImage } from "electron";

export async function writeClipboardImage(bytes: unknown): Promise<void> {
  if (!(bytes instanceof Uint8Array) || !bytes.byteLength || bytes.byteLength > 32 * 1024 * 1024) throw new Error("Invalid clipboard image");
  const image = nativeImage.createFromBuffer(Buffer.from(bytes));
  if (image.isEmpty()) throw new Error("Image could not be decoded");
  await clipboard.write([new ClipboardItem({ "image/png": new Blob([new Uint8Array(image.toPNG())], { type: "image/png" }) })]);
}
