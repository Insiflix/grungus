import React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { EmojiPicker } from "../../src/renderer/features/chat/EmojiPicker";
import "../../src/renderer/styles/index.css";

const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
const painted = async () => { await frame(); await frame(); };
const root = createRoot(document.getElementById("root")!);
let mount = 0;

Object.assign(window, { async measurePicker() {
  const opened = performance.now();
  flushSync(() => root.render(<EmojiPicker key={mount++} onPick={() => {}} onClose={() => {}} />));
  // Wait until the first screen's locally bundled glyphs are actually ready.
  const sheet = new Image();
  sheet.src = "/emoji/twitter-15.png";
  await sheet.decode();
  await painted();
  const openMilliseconds = performance.now() - opened;
  const timings: { category: string; milliseconds: number }[] = [];
  const buttons = [...document.querySelectorAll<HTMLButtonElement>(".emoji-categories button")];
  for (let pass = 0; pass < 2; pass++) {
    for (const button of buttons) {
      const start = performance.now();
      button.click();
      await painted();
      const milliseconds = performance.now() - start;
      const category = button.getAttribute("aria-label")!;
      if (button.getAttribute("aria-pressed") !== "true" || document.querySelector(".gif-picker__section")?.textContent !== category) throw new Error(`Category did not switch: ${category}`);
      if (document.querySelectorAll(".emoji-grid button").length > 88) throw new Error("Emoji virtualization exceeded its DOM budget");
      timings.push({ category, milliseconds });
    }
  }
  buttons[1].click();
  await painted();
  const viewport = document.querySelector<HTMLDivElement>(".emoji-picker__scroll")!;
  viewport.scrollTop = viewport.scrollHeight;
  viewport.dispatchEvent(new Event("scroll", { bubbles: true }));
  await painted();
  buttons[2].click();
  await painted();
  if (viewport.scrollTop !== 0) throw new Error("Category switch retained the previous scroll position");
  const dialog = document.querySelector("dialog")!.getBoundingClientRect();
  if (dialog.left < 0 || dialog.right > innerWidth) throw new Error("Picker clipped at narrow viewport");
  return { openMilliseconds, timings };
} });
