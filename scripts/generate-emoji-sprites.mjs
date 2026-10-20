import { readFile, writeFile } from "node:fs/promises";

// Must match the version and 61 x 61 cell layout of public/emoji/twitter-15.png.
const data = JSON.parse(await readFile("node_modules/@emoji-mart/data/sets/15/twitter.json", "utf8"));
const positions = {};
for (const emoji of Object.values(data.emojis)) {
  for (const skin of emoji.skins) {
    if (skin.x !== undefined) positions[skin.unified] = [skin.x, skin.y];
  }
}
await writeFile("src/renderer/features/chat/EmojiSprites.json", JSON.stringify({ cols: data.sheet.cols, rows: data.sheet.rows, positions }));
