import React from "react";
import { createRoot } from "react-dom/client";
import { AttachmentMessage } from "../../src/renderer/features/chat/AttachmentMessage";
import { AttachmentMediaContext } from "../../src/renderer/components/common/AttachmentMediaContext";
import "../../src/renderer/styles/index.css";

const files = [
  ["clip.webm", "video/webm"], ["clip.mp4", "video/mp4"], ["clip.mpg", "video/mpeg"],
  ["tone.mp3", "audio/mpeg"], ["tone.wav", "audio/wav"], ["tone.aiff", "audio/aiff"],
];
createRoot(document.getElementById("root")!).render(<AttachmentMediaContext.Provider value={async (attachment, signal) => {
  const response = await fetch(`/test-media/${attachment.name}`, { signal });
  if (!response.ok) throw new Error("Sample media unavailable");
  return response.blob();
}}><main style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 20, padding: 24, height: "100%", overflow: "auto" }}>
  {files.map(([name, mimeType]) => <section data-media={name} key={name}><h2>{name}</h2><AttachmentMessage attachment={{ name, mimeType, size: 8192, url: `mxc://example/${name}` }} inline /></section>)}
</main></AttachmentMediaContext.Provider>);
