import React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { DesktopFrame } from "../../src/renderer/components/common/DesktopFrame";
import { MessageComposer } from "../../src/renderer/features/chat/MessageComposer";
import { AttachmentMessage } from "../../src/renderer/features/chat/AttachmentMessage";
import { ImageViewer } from "../../src/renderer/features/chat/ImageViewer";
import { AttachmentMediaContext } from "../../src/renderer/components/common/AttachmentMediaContext";
import forestUrl from "../../src/renderer/assets/toad-forest.png";
import "../../src/renderer/styles/index.css";

const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
const painted = async () => { await frame(); await frame(); };
const finishZoom = async (button: HTMLElement) => {
  await painted();
  await Promise.all(button.getAnimations().map(animation => animation.finished));
};
const root = createRoot(document.getElementById("root")!);
let uploads: string[] = [];
let text: string[] = [];
const getUploadLimit = async () => 2 * 1024 * 1024;

Object.assign(window, { async checkChatInteractions() {
  flushSync(() => root.render(<DesktopFrame><section className="chat-workspace" style={{ height: "100%" }}>
    <header className="room-header"><div className="room-header__title"><span className="room-hash">#</span><h1>general</h1></div></header>
    <section className="timeline" data-history><div className="timeline__inner"><div className="room-intro"><h2>general</h2><p>Drop files anywhere in this chat to preview them.</p></div></div></section>
    <div className="composer-region"><MessageComposer roomName="general" getUploadLimit={getUploadLimit} onTyping={() => {}} onSend={async body => { text.push(body); }} onSendAttachment={async (file, progress) => { progress(100); uploads.push(file.name); }} /></div>
  </section></DesktopFrame>));
  await painted();
  const image = new File([await (await fetch("/grungus.png")).blob()], "grungus.png", { type: "image/png" });
  const data = new DataTransfer(); data.items.add(image); data.items.add(new File(["Example attachment"], "notes.txt", { type: "text/plain" }));
  const history = document.querySelector("[data-history]")!;
  history.dispatchEvent(new DragEvent("dragenter", { bubbles: true, cancelable: true, dataTransfer: data }));
  await painted();
  if (!document.querySelector(".attachment-drop")) throw new Error("Drop overlay missing");
  history.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: data }));
  await painted();
  const preview = document.querySelector<HTMLImageElement>(".attachment-draft img")!;
  if (!preview) throw new Error("Dropped image preview missing");
  await preview.decode();
  if (uploads.length || document.querySelectorAll(".attachment-draft__card").length !== 2) throw new Error("Drop must stage, never immediately upload");
  const bounds = preview.getBoundingClientRect();
  if (bounds.width < 40 || bounds.height < 40 || bounds.right > innerWidth) throw new Error("Image preview is clipped");
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  const selection = new DataTransfer(); selection.items.add(new File(["PDF"], "report.pdf", { type: "application/pdf" }));
  input.files = selection.files; input.dispatchEvent(new Event("change", { bubbles: true }));
  await painted();
  if (document.querySelectorAll(".attachment-draft__card").length !== 3) throw new Error("File selection did not add to the preview queue");
  if (document.querySelectorAll(".desktop-titlebar__controls button").length !== 3) throw new Error("Custom window controls missing");
  return { previews: 3, previewWidth: bounds.width, titlebarHeight: document.querySelector(".desktop-titlebar")!.getBoundingClientRect().height };
}, async sendDraft() {
  document.querySelector<HTMLButtonElement>('[aria-label="Send message"]')!.click();
  await painted();
  if (uploads.join(",") !== "grungus.png,notes.txt,report.pdf" || text.length || document.querySelector(".attachment-draft")) throw new Error("Attachment send did not complete cleanly");
  return { uploaded: uploads };
}, async checkUploadLimit() {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  const selection = new DataTransfer(); selection.items.add(new File([new Uint8Array(2 * 1024 * 1024 + 1)], "too-large.bin"));
  input.files = selection.files; input.dispatchEvent(new Event("change", { bubbles: true }));
  await painted();
  if (!document.querySelector(".attachment-draft__warning")?.textContent?.includes("2.0 MB per file")) throw new Error("Server size limit warning missing");
  if (!document.querySelector<HTMLButtonElement>('[aria-label="Send message"]')!.disabled) throw new Error("Oversized attachment can still be sent");
  document.querySelector("form")!.requestSubmit();
  await painted();
  if (uploads.length !== 3) throw new Error("Oversized file reached upload handler");
  return { oversizedBlocked: true };
}, async checkImageViewer() {
  const blob = await (await fetch(forestUrl)).blob();
  const load = async () => blob;
  flushSync(() => root.render(<DesktopFrame><section className="chat-workspace" style={{ height: "100%" }}>
    <header className="room-header"><h1># general</h1></header>
    <section className="timeline"><div className="timeline__inner"><h3>jukodev</h3><AttachmentMediaContext.Provider value={load}><AttachmentMessage attachment={{ name: "forest.png", url: "mxc://example/forest", mimeType: "image/png", size: blob.size }} inline sender={{ id: "@jukodev:example", displayName: "jukodev", avatarUrl: null }} timestamp={Date.now()} /></AttachmentMediaContext.Provider></div></section>
  </section></DesktopFrame>));
  await painted();
  const thumbnail = document.querySelector<HTMLButtonElement>('[aria-label="View forest.png"]')!;
  await thumbnail.querySelector("img")!.decode();
  if (document.querySelector(".message-attachment__details")) throw new Error("Image thumbnail still has file metadata controls");
  thumbnail.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 150, clientY: 180 }));
  await painted();
  if (!document.querySelector('[role="menu"]')) throw new Error("Right-click image actions missing");
  document.querySelector('[role="menu"]')!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  thumbnail.focus(); thumbnail.click();
  await painted();
  const viewer = document.querySelector<HTMLDialogElement>(".image-viewer[open]")!;
  if (!viewer) throw new Error("Image viewer did not open");
  const image = viewer.querySelector("img")!;
  await image.decode();
  const bounds = image.getBoundingClientRect();
  if (bounds.width < 400 || bounds.left < 0 || bounds.right > innerWidth || bounds.bottom > innerHeight) throw new Error("Full-size image did not fit the window");
  viewer.querySelector<HTMLButtonElement>('[aria-label="Zoom image"]')!.click();
  const imageButton = viewer.querySelector<HTMLButtonElement>(".image-viewer__image")!;
  await finishZoom(imageButton);
  if (!viewer.querySelector(".is-zoomed")) throw new Error("Image zoom did not activate");
  const zoomRatio = image.getBoundingClientRect().width / bounds.width;
  if (Math.abs(zoomRatio - 2.5) > .02) throw new Error(`Zoom must magnify the fitted image 2.5x, got ${zoomRatio}`);
  if (parseFloat(getComputedStyle(imageButton).transitionDuration) <= 0) throw new Error("Zoom animation missing");
  viewer.querySelector<HTMLButtonElement>('[aria-label="Fit image to window"]')!.click();
  await finishZoom(imageButton);
  if (Math.abs(image.getBoundingClientRect().width - bounds.width) > 1) throw new Error("Zoom out did not restore fitted size");
  imageButton.click();
  await finishZoom(imageButton);
  if (Math.abs(image.getBoundingClientRect().width / bounds.width - 2.5) > .02) throw new Error("Clicking the image did not magnify it");
  imageButton.click(); await finishZoom(imageButton);
  const probe = document.createElement("span"); probe.style.background = "var(--glass-heavy)"; viewer.append(probe);
  if (getComputedStyle(viewer.querySelector(".image-viewer__toolbar")!).backgroundColor !== getComputedStyle(probe).backgroundColor) throw new Error("Viewer toolbar does not match the app theme");
  probe.remove();
  viewer.querySelector<HTMLButtonElement>('[aria-label="More image options"]')!.click();
  await painted();
  if (!viewer.querySelector('[role="menu"]')) throw new Error("Image menu rendered outside the modal top layer");
  viewer.querySelector('[role="menu"]')!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  await painted();
  return { imageWidth: Math.round(bounds.width), imageHeight: Math.round(bounds.height), viewer: true, zoomRatio, animated: true };
}, async checkSmallImageZoom() {
  flushSync(() => root.render(<ImageViewer src="/grungus.png" name="small.png" onClose={() => {}} onDownload={() => {}} onCopyLink={() => {}} downloading={false} error="" />));
  await painted();
  const image = document.querySelector<HTMLImageElement>(".image-viewer__image img")!;
  await image.decode();
  const width = image.getBoundingClientRect().width;
  const button = document.querySelector<HTMLButtonElement>(".image-viewer__image")!;
  button.click(); await finishZoom(button);
  const ratio = image.getBoundingClientRect().width / width;
  if (Math.abs(ratio - 2.5) > .02 || image.getBoundingClientRect().width <= image.naturalWidth) throw new Error("Small images must magnify beyond their original size");
  document.documentElement.dataset.reduceMotion = "true";
  if (parseFloat(getComputedStyle(button).transitionDuration) !== 0) throw new Error("Zoom ignores reduced motion preference");
  delete document.documentElement.dataset.reduceMotion;
  return { smallImageZoomRatio: ratio, reducedMotionRespected: true };
}, async closeImageViewer() {
  document.querySelector(".image-viewer")!.dispatchEvent(new Event("cancel", { cancelable: true }));
  await painted();
  if (document.querySelector(".image-viewer") || document.activeElement?.getAttribute("aria-label") !== "View forest.png") throw new Error("Viewer did not close and restore thumbnail focus");
  return { focusRestored: true };
} });
