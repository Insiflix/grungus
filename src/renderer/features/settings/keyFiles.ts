export async function encryptRoomKeys(json: string, passphrase: string): Promise<string> {
  if (passphrase.length < 8) throw new Error("Use a passphrase of at least 8 characters.");
  const { OlmMachine, initAsync } = await import("@matrix-org/matrix-sdk-crypto-wasm");
  await initAsync();
  return OlmMachine.encryptExportedRoomKeys(json, passphrase, 500_000);
}

export async function decryptRoomKeys(file: string, passphrase: string): Promise<string> {
  const { OlmMachine, initAsync } = await import("@matrix-org/matrix-sdk-crypto-wasm");
  await initAsync();
  try { return OlmMachine.decryptExportedRoomKeys(file, passphrase); }
  catch { throw new Error("Unable to decrypt this key file. Check the file and passphrase."); }
}

export function downloadText(text: string, filename: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url; link.download = filename;
  document.body.appendChild(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
