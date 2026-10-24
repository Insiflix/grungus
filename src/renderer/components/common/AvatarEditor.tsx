import { Image as ImageIcon, RotateCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/** The preview and PNG export use the same canvas transform, preserving alpha. */
export function AvatarEditor({ file, onSave, onClose }: { file: File; onSave: (file: File) => Promise<void>; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const [image, setImage] = useState<HTMLCanvasElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const el = dialog.current!; el.showModal();
    if (file.size > 10 * 1024 * 1024) { setError("Choose an image smaller than 10 MB."); return () => el.close(); }
    const url = URL.createObjectURL(file); const img = new Image(); let active = true;
    img.onload = () => {
      if (!active) return;
      const still = document.createElement("canvas"); still.width = img.naturalWidth; still.height = img.naturalHeight;
      const context = still.getContext("2d");
      if (!context) { setError("Image editing is unavailable."); return; }
      context.drawImage(img, 0, 0); setImage(still);
    };
    img.onerror = () => { if (active) setError("This image could not be opened. Choose another image."); };
    img.src = url;
    return () => { active = false; URL.revokeObjectURL(url); el.close(); };
  }, [file]);
  const draw = (context: CanvasRenderingContext2D, size: number) => {
    context.clearRect(0, 0, size, size);
    if (!image) return;
    const scale = size / Math.max(image.width, image.height) * zoom;
    const w = image.width * scale, h = image.height * scale;
    context.save();
    context.translate(size / 2 + offset.x * size / 280, size / 2 + offset.y * size / 280);
    context.rotate(rotation * Math.PI / 180);
    context.drawImage(image, -w / 2, -h / 2, w, h);
    context.restore();
  };
  useEffect(() => { const context = canvas.current?.getContext("2d"); if (context) draw(context, 280); }, [image, zoom, offset, rotation]);
  const close = () => { if (!saving.current) onClose(); };
  const save = async () => {
    if (!image || saving.current) return;
    saving.current = true; setBusy(true); setError("");
    try {
      const output = document.createElement("canvas"); output.width = output.height = 512;
      const context = output.getContext("2d"); if (!context) throw new Error("Image editing is unavailable.");
      draw(context, 512);
      const blob = await new Promise<Blob>((resolve, reject) => output.toBlob(value => value ? resolve(value) : reject(new Error("Unable to crop image.")), "image/png"));
      await onSave(new File([blob], "avatar.png", { type: "image/png" }));
      onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save avatar."); }
    finally { saving.current = false; setBusy(false); }
  };
  return <dialog ref={dialog} className="avatar-editor" aria-labelledby="avatar-editor-title" onCancel={event => { event.preventDefault(); event.stopPropagation(); close(); }}>
    <h2 id="avatar-editor-title">Adjust avatar</h2><p>Drag to align. The circle shows how your avatar will appear.</p>
    <canvas ref={canvas} width={280} height={280} className="avatar-editor__preview" aria-label="Avatar crop preview" onPointerDown={event => { if (busy) return; event.currentTarget.setPointerCapture(event.pointerId); drag.current = { x: event.clientX, y: event.clientY, left: offset.x, top: offset.y }; }} onPointerMove={event => { if (!drag.current) return; const ratio = 280 / event.currentTarget.getBoundingClientRect().width; setOffset({ x: drag.current.left + (event.clientX - drag.current.x) * ratio, y: drag.current.top + (event.clientY - drag.current.y) * ratio }); }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} />
    <div className="avatar-editor__controls" role="group" aria-label="Avatar adjustments">
      <ImageIcon size={14} aria-hidden="true" />
      <input aria-label="Zoom" aria-valuetext={`${Math.round(zoom * 100)}%`} type="range" min="0.1" max="4" step="0.01" value={zoom} disabled={busy || !image} onChange={event => setZoom(Number(event.target.value))} />
      <ImageIcon size={22} aria-hidden="true" />
      <button type="button" className="avatar-editor__rotate" aria-label="Rotate image" data-tooltip="Rotate image 90 degrees" disabled={busy || !image} onClick={() => setRotation(value => (value + 90) % 360)}><RotateCw size={20} /></button>
    </div>
    {file.type === "image/gif" && <p>Saving a crop uses the displayed frame as a still PNG.</p>}
    {error && <p role="alert" className="error-banner">{error}</p>}
    <div className="settings-actions"><button className="button button--primary" disabled={busy || !image} onClick={() => void save()}>{busy ? "Saving…" : "Save avatar"}</button><button className="button button--secondary" disabled={busy} onClick={close}>Cancel</button></div>
  </dialog>;
}

