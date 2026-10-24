import React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { AvatarEditor } from "../../src/renderer/components/common/AvatarEditor";
import { Avatar } from "../../src/renderer/components/common/Avatar";
import "../../src/renderer/styles/index.css";

const root = createRoot(document.getElementById("root")!);
const tick = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
let saved: File | undefined;
let closed = 0;
let file: File;
function mount() {
  flushSync(() => root.render(<><ul className="voice-members"><li><Avatar name="Transparent" url={URL.createObjectURL(file)} size="small" /><span>Transparent avatar</span></li></ul><AvatarEditor file={file} onClose={() => { closed++; flushSync(() => root.render(null)); }} onSave={async value => { saved = value; }} /></>));
}
function setRange(label: string, value: string) {
  const input = document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true })); input.dispatchEvent(new Event("change", { bubbles: true }));
}
Object.assign(window, {
  async prepareAvatarEditor() {
    const image = document.createElement("canvas"); image.width = 400; image.height = 200;
    const context = image.getContext("2d")!; context.fillStyle = "#00ff00"; context.fillRect(100, 50, 200, 100);
    const blob = await new Promise<Blob>(resolve => image.toBlob(value => resolve(value!), "image/png"));
    file = new File([blob], "transparent.png", { type: "image/png" }); mount();
    for (let i = 0; i < 50 && document.querySelector<HTMLButtonElement>(".button--primary")?.disabled; i++) await tick();
    await tick();
    const avatar = document.querySelector(".voice-members .avatar")!.getBoundingClientRect();
    assert(avatar.width === 24 && avatar.height === 24, "Voice avatar was squashed");
    assert(!saved, "Avatar saved before confirmation");
    assert(document.querySelectorAll('input[type="range"]').length === 1, "Editor should only have a zoom slider");
    assert(![...document.querySelectorAll("button")].some(button => ["Center", "Fit", "Fill"].includes(button.textContent ?? "")), "Removed controls are still present");
    const preview = document.querySelector("canvas")!;
    const rotate = document.querySelector<HTMLButtonElement>('[aria-label="Rotate image"]')!;
    rotate.click(); await tick();
    assert(preview.getContext("2d")!.getImageData(140,90,1,1).data[3] === 255, "Rotate did not update the preview");
    for (let i = 0; i < 3; i++) { rotate.click(); await tick(); }
    // Compare both menus using their actual shared CSS classes, including a
    // profile menu hosted in a dialog with a different inherited font size.
    const messageMenu = document.createElement("div"); messageMenu.className = "message-context-menu";
    const profileMenu = document.createElement("div"); profileMenu.className = "message-context-menu profile-actions-menu";
    messageMenu.innerHTML = profileMenu.innerHTML = "<button>Message</button>";
    document.body.append(messageMenu); document.querySelector("dialog")!.append(profileMenu);
    profileMenu.parentElement!.style.fontSize = "11px";
    const messageFont = getComputedStyle(messageMenu.firstElementChild!).fontSize;
    const profileFont = getComputedStyle(profileMenu.firstElementChild!).fontSize;
    assert(messageFont === profileFont && messageFont === "14px", "Context-menu font sizes differ");
    messageMenu.remove(); profileMenu.parentElement!.style.removeProperty("font-size"); profileMenu.remove();
    return { avatarWidth: avatar.width, avatarHeight: avatar.height, rotation: true, menuFont: messageFont };
  },
  avatarDragPoints() {
    const rect = document.querySelector("canvas")!.getBoundingClientRect();
    return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2), dx: Math.round(35 * rect.width / 280) };
  },
  async checkAvatarExport() {
    setRange("Zoom", "2");
    document.querySelector<HTMLButtonElement>('[aria-label="Rotate image"]')!.click(); await tick();
    const preview = document.querySelector("canvas")!;
    const previewPixels = preview.getContext("2d")!.getImageData(0, 0, 280, 280).data;
    const previewAlpha = (x: number, y: number) => previewPixels[(y * 280 + x) * 4 + 3];
    assert(previewAlpha(20,140) === 0 && previewAlpha(140,140) === 255 && previewAlpha(140,20) === 255, "Alignment did not move the image");
    const primary = document.querySelector<HTMLButtonElement>(".button--primary")!; primary.click();
    for (let i = 0; i < 50 && !saved; i++) await tick();
    assert(saved?.type === "image/png", "Export is not PNG");
    const bitmap = await createImageBitmap(saved!); assert(bitmap.width === 512 && bitmap.height === 512, "Wrong crop dimensions");
    const output = document.createElement("canvas"); output.width = output.height = 512;
    output.getContext("2d")!.drawImage(bitmap, 0, 0);
    const pixels = output.getContext("2d")!.getImageData(0, 0, 512, 512).data;
    assert(pixels[3] === 0 && pixels[(256*512+256)*4+3] === 255, "Transparency was lost");
    assert(pixels[(256*512+30)*4+3] === 0, "Saved crop differs from preview");
    assert(pixels[(40*512+256)*4+3] === 255, "Rotation was not included in the saved crop");
    bitmap.close(); assert(closed === 1, "Editor did not close after save");
    return { type: saved!.type, size: "512x512", transparency: true, aligned: true, rotated: true };
  },
  async checkAvatarCancel() {
    saved = undefined; mount(); await tick();
    const dialog = document.querySelector("dialog")!; dialog.dispatchEvent(new Event("cancel", { cancelable: true, bubbles: true })); await tick();
    assert(!saved && closed === 2 && !document.querySelector("dialog"), "Cancel uploaded an image or left the editor open");
    return { cancelledWithoutSaving: true };
  },
});
