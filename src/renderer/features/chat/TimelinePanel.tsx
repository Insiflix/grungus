import { ChevronDown } from "lucide-react";
import { Phone, Video } from "lucide-react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import type { MatrixRoom, MatrixMessage } from "../../../domain/matrix/MatrixTypes";
import { LockKeyhole as LockIcon, UsersRound as UsersIcon, UserPlus } from "lucide-react";
import { PeopleDialog } from "../rooms/PeopleDialog";
import { useMatrixTimeline } from "../../hooks/matrix/useMatrixTimeline";
import { MessageComposer } from "./MessageComposer";
import { MessageRow } from "./MessageRow";
import type { MessageAction } from "./MessageContextMenu";
import { BrandLogo } from "../../components/common/BrandLogo";
import { usePreferences } from "../../hooks/usePreferences";
import { Settings } from "lucide-react";

// Typing and sync updates must not re-render unchanged Markdown message bodies.
const TimelineMessage = memo(function TimelineMessage({ message, grouped, onReact, onAction, onMediaLoad }: {
  message: MatrixMessage;
  grouped: boolean;
  onReact: (message: MatrixMessage, key: string) => Promise<void>;
  onAction: (message: MatrixMessage, type: MessageAction) => Promise<void>;
  onMediaLoad: () => void;
}) {
  return <MessageRow message={message} grouped={grouped} onReact={key => onReact(message, key)} onAction={type => onAction(message, type)} onMediaLoad={onMediaLoad} />;
});

interface TimelinePanelProps {
  room: MatrixRoom | null;
  onOpenIdentity: () => void;
  onOpenSettings: () => void;
  onCall: (video: boolean) => void;
  callActive: boolean;
  onDirectCall: (video: boolean) => void;
}

export function TimelinePanel({ room, onOpenIdentity, onOpenSettings, onCall, callActive, onDirectCall }: TimelinePanelProps) {
  const prefs = usePreferences();
  const { messages, members, typingMembers, loadOlder, sendMessage, sendAttachment, getUploadLimit, setTyping, toggleReaction, editMessage, deleteMessage, togglePin } =
    useMatrixTimeline(room?.id ?? null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [inviting, setInviting] = useState(false);
  const [action, setAction] = useState<{ type: "reply" | "edit"; message: MatrixMessage } | null>(null);
  const activeAction = action?.message.roomId === room?.id ? action : null;
  const endRef = useRef<HTMLDivElement>(null);
  const previousRoom = useRef<string | null>(null);
  const previousLength = useRef(0);
  const nearBottom = useRef(true);

  const handleMessageAction = useCallback(async (message: MatrixMessage, type: MessageAction) => {
    if (type === "reply" || type === "edit") setAction({ type, message });
    else if (type === "delete") await deleteMessage(message);
    else await togglePin(message);
  }, [deleteMessage, togglePin]);
  const handleMediaLoad = useCallback(() => {
    if (nearBottom.current) endRef.current?.scrollIntoView({ block: "end" });
  }, []);

  useEffect(() => {
    const changedRoom = previousRoom.current !== room?.id;
    const appended = messages.length > previousLength.current;
    if (changedRoom || appended) endRef.current?.scrollIntoView({ behavior: changedRoom || prefs.reduceMotion || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
    previousRoom.current = room?.id ?? null;
    previousLength.current = messages.length;
  }, [messages.length, room?.id, prefs.reduceMotion]);

  useEffect(() => setHasMore(true), [room?.id]);
  useEffect(() => setAction(null), [room?.id]);

  if (!room) {
    return (
      <div className="empty-chat">
        <div className="empty-chat__glyph"><BrandLogo className="brand-mark--large" /></div>
        <h2>Select a room</h2>
        <p>Choose a room on the left or a direct message above.</p>
      </div>
    );
  }

  const handleLoadOlder = async () => {
    setLoadingOlder(true);
    const more = await loadOlder();
    setHasMore(more);
    setLoadingOlder(false);
  };

  return (
    <>
      <header className="room-header">
        <div className="room-header__title">
          {room.isEncrypted ? <LockIcon /> : <span className="room-hash">#</span>}
          <div>
            <h1>{room.name}</h1>
            {room.topic && <p>{room.topic}</p>}
          </div>
        </div>
        <div className="room-header__actions">
          <button type="button" className="icon-button" aria-label="Room settings" title="Room settings" onClick={onOpenSettings}><Settings /></button>
          <button className="icon-button" title="Sprachanruf / laufendem Anruf beitreten" aria-label="Sprachanruf starten" disabled={callActive} onClick={() => onCall(false)}><Phone /></button>
          <button className="icon-button" title="Videoanruf / laufendem Anruf beitreten" aria-label="Videoanruf starten" disabled={callActive} onClick={() => onCall(true)}><Video /></button>
          {room.memberCount === 2 && <details className="call-options"><summary title="Klassische Matrix-Anrufe" aria-label="Weitere Anrufoptionen"><ChevronDown size={16} /></summary><div><button disabled={callActive} onClick={event => { event.currentTarget.closest("details")?.removeAttribute("open"); onDirectCall(false); }}>Klassischer Sprachanruf</button><button disabled={callActive} onClick={event => { event.currentTarget.closest("details")?.removeAttribute("open"); onDirectCall(true); }}>Klassischer Videoanruf</button></div></details>}
          <button type="button" className="icon-button room-invite-button" aria-label="Invite people to this room" title="Invite people" onClick={() => setInviting(true)}><UserPlus /></button>
          {room.isEncrypted && <button type="button" className="encrypted-pill" onClick={onOpenIdentity} title="Identität & Verschlüsselung"><LockIcon /> Encrypted</button>}
          <span className="member-count"><UsersIcon /> {room.memberCount}</span>
        </div>
      </header>

      <section className="timeline" aria-label={`${room.name} message timeline`} onScroll={(event) => {
        const element = event.currentTarget;
        nearBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 160;
      }}>
        <div className="timeline__inner">
          {hasMore && (
            <button
              type="button"
              className="load-older"
              onClick={() => void handleLoadOlder()}
              disabled={loadingOlder}
            >
              {loadingOlder ? "Loading history…" : "Load older messages"}
            </button>
          )}
          <div className="room-intro">
            <div>{room.isEncrypted ? <LockIcon /> : "#"}</div>
            <h2>{room.name}</h2>
            <p>{room.topic || "Start of loaded history."}</p>
          </div>
          {messages.map((message, index) => {
            const previous = messages[index - 1];
            const grouped = prefs.groupMessages && Boolean(
              previous &&
                previous.sender.id === message.sender.id &&
                message.timestamp - previous.timestamp < 5 * 60_000,
            );
            return (
              <TimelineMessage
                key={message.id}
                message={message}
                grouped={grouped}
                onReact={toggleReaction}
                onAction={handleMessageAction}
                onMediaLoad={handleMediaLoad}
              />
            );
          })}
          {messages.length === 0 && <p className="timeline-empty">No messages loaded yet.</p>}
          <div ref={endRef} />
        </div>
      </section>

      <div className="composer-region">
        <div className="typing-line" aria-live="polite">
          {prefs.showTyping && typingMembers.length > 0 && (
            <><span className="typing-dots"><i /><i /><i /></span> {typingMembers.map((member) => member.displayName).join(", ")} {typingMembers.length === 1 ? "is" : "are"} typing</>
          )}
        </div>
        <MessageComposer
          key={room.id}
          roomName={room.name}
          members={members}
          editing={activeAction?.type === "edit" ? activeAction.message : null}
          replying={activeAction?.type === "reply" ? activeAction.message : null}
          onCancelAction={() => setAction(null)}
          onSend={async body => {
            if (activeAction?.type === "edit") await editMessage(activeAction.message, body);
            else await sendMessage(body, activeAction?.message.id);
            setAction(null);
          }}
          getUploadLimit={getUploadLimit}
          onSendAttachment={async (file, onProgress) => { await sendAttachment(file, onProgress, activeAction?.type === "reply" ? activeAction.message.id : undefined); setAction(null); }}
          onTyping={setTyping}
        />
      </div>
      {inviting && <PeopleDialog key={room.id} room={room} onClose={() => setInviting(false)} />}
    </>
  );
}



