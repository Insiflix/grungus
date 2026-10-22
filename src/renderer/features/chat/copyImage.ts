async function asPng(blob: Blob): Promise<Blob> {
  if (blob.type === "image/png") return blob;
  const image = await createImageBitmap(blob);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image conversion unavailable.");
    context.drawImage(image, 0, 0);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("Image conversion failed.")), "image/png"));
  } finally { image.close(); }
}
export async function copyImage(blob: Blob): Promise<void> {
  const png = asPng(blob);
  // Browser clipboard works with an already-running Electron host, even when its
  // main process predates the image IPC handler. Keep activation for this write.
  if (typeof navigator.clipboard?.write === "function" && typeof ClipboardItem === "function") {
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
      return;
    } catch (error) {
      if (!window.desktop?.clipboard?.writeImage) throw error;
    }
  }
  if (window.desktop?.clipboard?.writeImage) {
    await window.desktop.clipboard.writeImage(new Uint8Array(await (await png).arrayBuffer()));
    return;
  }
  await png;
  throw new Error("Image clipboard unavailable.");
}
