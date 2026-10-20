import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { FileText, Upload, X } from "lucide-react";
import { attachmentSizeWarning, formatFileSize } from "../../../domain/messaging/Attachments";
import { roomDrafts, useRoomDraft } from "./RoomDrafts";

export interface DraftAttachment { id: string; file: File; preview?: string }

export function useAttachmentDraft(form: RefObject<HTMLFormElement | null>, enabled: boolean, draftKey?: string) {
  const saved = useRoomDraft(draftKey);
  const [files, setFiles] = useState<DraftAttachment[]>([]);
  const [dragging, setDragging] = useState(false);
  const current = useRef<DraftAttachment[]>([]);
  useEffect(() => {
    if (!draftKey) return;
    current.current.forEach(item => { if (item.preview) URL.revokeObjectURL(item.preview); });
    current.current = saved.files.map(item => ({ ...item, preview: item.file.type.startsWith("image/") ? URL.createObjectURL(item.file) : undefined }));
    setFiles(current.current);
  }, [draftKey, saved.files]);
  const add = useCallback((incoming: File[]) => {
    if (!enabled) return;
    const added = incoming.map(file => ({ id: crypto.randomUUID(), file, preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined }));
    current.current = [...current.current, ...added]; setFiles(current.current);
    roomDrafts.patch(draftKey, { files: current.current.map(({ id, file }) => ({ id, file })) });
  }, [enabled, draftKey]);
  const remove = useCallback((id: string) => {
    const file = current.current.find(item => item.id === id);
    if (file?.preview) URL.revokeObjectURL(file.preview);
    current.current = current.current.filter(item => item.id !== id); setFiles(current.current);
    roomDrafts.patch(draftKey, { files: current.current.map(({ id, file }) => ({ id, file })) });
  }, [draftKey]);
  useEffect(() => () => { current.current.forEach(item => { if (item.preview) URL.revokeObjectURL(item.preview); }); }, []);
  useEffect(() => {
    const root = form.current?.closest(".chat-workspace") ?? form.current;
    if (!root) return;
    let depth = 0;
    const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes("Files");
    const enter = (event: Event) => { if (enabled && hasFiles(event as DragEvent)) { depth++; setDragging(true); } };
    const leave = () => { depth = Math.max(0, depth - 1); if (!depth) setDragging(false); };
    const over = (event: Event) => { const drag = event as DragEvent; if (hasFiles(drag)) { event.preventDefault(); if (drag.dataTransfer) drag.dataTransfer.dropEffect = enabled ? "copy" : "none"; } };
    const drop = (event: Event) => {
      const drag = event as DragEvent;
      if (!hasFiles(drag)) return;
      event.preventDefault(); depth = 0; setDragging(false);
      if (enabled) add(Array.from(drag.dataTransfer?.files ?? []));
    };
    const preventNavigation = (event: DragEvent) => { if (hasFiles(event)) { event.preventDefault(); if (event.type === "drop") { depth = 0; setDragging(false); } } };
    root.addEventListener("dragenter", enter); root.addEventListener("dragleave", leave); root.addEventListener("dragover", over); root.addEventListener("drop", drop);
    window.addEventListener("dragover", preventNavigation); window.addEventListener("drop", preventNavigation);
    return () => {
      root.removeEventListener("dragenter", enter); root.removeEventListener("dragleave", leave); root.removeEventListener("dragover", over); root.removeEventListener("drop", drop);
      window.removeEventListener("dragover", preventNavigation); window.removeEventListener("drop", preventNavigation);
    };
  }, [form, enabled, add]);
  return { files, dragging: dragging && enabled, add, remove };
}

export function AttachmentDraft({ files, remove, sending, progress, maxSize }: { maxSize?: number | null; files: DraftAttachment[]; remove: (id: string) => void; sending: boolean; progress: { id: string; percent: number } | null }) {
  return <div className="attachment-draft" aria-label="Attachments ready to send">{files.map(item => <div className={`attachment-draft__card ${typeof maxSize === "number" && item.file.size > maxSize ? "is-too-large" : ""}`} key={item.id}>
    <div className="attachment-draft__preview">{item.preview ? <img src={item.preview} alt={`Preview of ${item.file.name}`} /> : <FileText size={38} />}</div>
    <button type="button" className="attachment-draft__remove" aria-label={`Remove ${item.file.name}`} disabled={sending} onClick={() => remove(item.id)}><X size={14} /></button>
    <strong data-tooltip={item.file.name}>{item.file.name}</strong><small>{progress?.id === item.id ? `Uploading ${progress.percent}%` : formatFileSize(item.file.size)}</small>
    {typeof maxSize === "number" && item.file.size > maxSize && <p className="attachment-draft__warning" role="alert">{attachmentSizeWarning(item.file, maxSize)}</p>}
    {progress?.id === item.id && <progress aria-label={`Uploading ${item.file.name}`} max={100} value={progress.percent} />}
  </div>)}</div>;
}
export function AttachmentDropOverlay() {
  return <div className="attachment-drop" role="status"><Upload size={42} /><strong>Drop files to attach</strong><span>Preview them before sending</span></div>;
}
