import { ChevronDown } from "lucide-react";
import { Phone, Video } from "lucide-react";
import { memo, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
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
import { useTimelineScroll } from "./useTimelineScroll";
import { RoomMemberList } from "../rooms/RoomMemberList";
import { roomDrafts, useRoomDraft } from "./RoomDrafts";
import { BlockedUserBadge } from "../../components/common/BlockedUserBadge";

// Typing and sync updates must not re-render unchanged Markdown message bodies.
const TimelineMessage = memo(function TimelineMessage({ message, grouped, onReact, onAction, onMediaLoad, onRetry, onCancelSend }: {
  onRetry?: (id: string) => Promise<void>;
  onCancelSend?: (id: string) => Promise<void>;
  message: MatrixMessage;
  grouped: boolean;
  onReact: (message: MatrixMessage, key: string) => Promise<void>;
  onAction: (message: MatrixMessage, type: MessageAction) => Promise<void>;
  onMediaLoad: () => void;
}) {
  return <MessageRow message={message} grouped={grouped} onRetry={onRetry ? () => onRetry(message.id) : undefined} onCancelSend={onCancelSend ? () => onCancelSend(message.id) : undefined} onReact={key => onReact(message, key)} onAction={type => onAction(message, type)} onMediaLoad={onMediaLoad} />;
});

interface TimelinePanelProps {
  draftKey?: string;
  search?: ReactNode;
  room: MatrixRoom | null;
  onOpenIdentity: () => void;
  onOpenSettings: () => void;
  onCall: (video: boolean) => void;
  callActive: boolean;
  onDirectCall: (video: boolean) => void;
  compact?: boolean;
}

export function TimelinePanel({ room, draftKey, search, onOpenIdentity, onOpenSettings, onCall, callActive, onDirectCall, compact = false }: TimelinePanelProps) {
  const savedDraft = useRoomDraft(draftKey);
  const prefs = usePreferences();
  const { messages, members, typingMembers, loadOlder, sendMessage, createPoll, sendAttachment, getUploadLimit, setTyping, toggleReaction, editMessage, deleteMessage, togglePin, retryMessage, cancelSend } =
    useMatrixTimeline(room?.id ?? null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [inviting, setInviting] = useState(false);
  const [membersVisible, setMembersVisible] = useState(false);
  const memberToggle = useRef<HTMLButtonElement>(null);
  const closeMembers = () => { setMembersVisible(false); memberToggle.current?.focus(); };
  const [action, setAction] = useState<{ type: "reply" | "edit"; message: MatrixMessage } | null>(null);
  const activeAction = action?.message.roomId === room?.id ? action : savedDraft.reply && savedDraft.reply.roomId === room?.id ? { type: "reply" as const, message: savedDraft.reply } : null;
  const { timelineRef, contentRef, onScroll, scrollToLatest, pauseAutoScroll } = useTimelineScroll(room?.id ?? null, messages);

  const handleMessageAction = useCallback(async (message: MatrixMessage, type: MessageAction) => {
    if (type === "reply") { roomDrafts.patch(draftKey, { reply: message }); setAction({ type, message }); }
    else if (type === "edit") setAction({ type, message });
    else if (type === "delete") await deleteMessage(message);
    else await togglePin(message);
  }, [deleteMessage, togglePin, draftKey]);
  useEffect(() => setHasMore(true), [room?.id]);
  useEffect(() => setAction(null), [room?.id]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const focus = (event: Event) => {
      const detail = (event as CustomEvent<{ roomId: string; eventId: string }>).detail;
      if (detail.roomId !== room?.id) return;
      const node = document.getElementById(`message-${detail.eventId}`);
      if (node) pauseAutoScroll();
      node?.scrollIntoView({ block: "center", behavior: "smooth" }); node?.classList.add("is-search-target");
      timer = setTimeout(() => node?.classList.remove("is-search-target"), 3000);
    };
    window.addEventListener("grungus:focus-message", focus);
    return () => { window.removeEventListener("grungus:focus-message", focus); clearTimeout(timer); };
  }, [room?.id, pauseAutoScroll]);

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
    pauseAutoScroll();
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
            <h1><span className="user-name-label">{compact ? "Voice chat" : room.name}</span>{room.isDirect && room.memberCount <= 2 && <BlockedUserBadge userId={room.directUserId} />}</h1>
            {room.topic && <p>{room.topic}</p>}
          </div>
        </div>
        <div className="room-header__actions" hidden={compact}>
          <button type="button" className="icon-button" aria-label="Room settings" data-tooltip="Room settings" onClick={onOpenSettings}><Settings /></button>
          <button className="icon-button" data-tooltip="Sprachanruf / laufendem Anruf beitreten" aria-label="Sprachanruf starten" disabled={callActive} onClick={() => onCall(false)}><Phone /></button>
          <button className="icon-button" data-tooltip="Videoanruf / laufendem Anruf beitreten" aria-label="Videoanruf starten" disabled={callActive} onClick={() => onCall(true)}><Video /></button>
          {room.memberCount === 2 && <details className="call-options"><summary data-tooltip="Klassische Matrix-Anrufe" aria-label="Weitere Anrufoptionen"><ChevronDown size={16} /></summary><div><button disabled={callActive} onClick={event => { event.currentTarget.closest("details")?.removeAttribute("open"); onDirectCall(false); }}>Klassischer Sprachanruf</button><button disabled={callActive} onClick={event => { event.currentTarget.closest("details")?.removeAttribute("open"); onDirectCall(true); }}>Klassischer Videoanruf</button></div></details>}
          <button type="button" className="icon-button room-invite-button" aria-label="Invite people to this room" data-tooltip="Invite people" onClick={() => setInviting(true)}><UserPlus /></button>
          {room.isEncrypted && <button type="button" className="encrypted-pill" onClick={onOpenIdentity} data-tooltip="Identität & Verschlüsselung"><LockIcon /> Encrypted</button>}
          <button ref={memberToggle} type="button" className="member-count" aria-label="Show room members" data-tooltip="Room members"
            aria-expanded={membersVisible} aria-controls="room-members" onClick={() => setMembersVisible(visible => !visible)}><UsersIcon /> {room.memberCount}</button>
          {search}
        </div>
      </header>

      <div className="room-body">
      <div className="room-conversation">
      <section ref={timelineRef} className="timeline" aria-label={`${room.name} message timeline`} onScroll={onScroll}>
        <div ref={contentRef} className="timeline__inner">
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
                onMediaLoad={scrollToLatest}
                onRetry={retryMessage}
                onCancelSend={cancelSend}
              />
            );
          })}
          {messages.length === 0 && <p className="timeline-empty">No messages loaded yet.</p>}
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
          draftKey={draftKey}
          members={members}
          editing={activeAction?.type === "edit" ? activeAction.message : null}
          replying={activeAction?.type === "reply" ? activeAction.message : null}
          onCancelAction={() => { setAction(null); if (activeAction?.type !== "edit") roomDrafts.patch(draftKey, { reply: null }); }}
          onSendComplete={() => { setAction(null); if (activeAction?.type !== "edit") roomDrafts.patch(draftKey, { reply: null }); }}
          onSend={async body => {
            if (activeAction?.type === "edit") await editMessage(activeAction.message, body);
            else await sendMessage(body, activeAction?.message.id);
          }}
          getUploadLimit={getUploadLimit}
          onSendAttachment={async (file, onProgress) => { await sendAttachment(file, onProgress, activeAction?.type === "reply" ? activeAction.message.id : undefined); }}
          onSendPoll={createPoll}
          onTyping={setTyping}
        />
      </div>
      </div>
      {membersVisible && <RoomMemberList key={room.id} members={members} onClose={closeMembers} />}
      </div>
      {inviting && <PeopleDialog key={room.id} room={room} onClose={() => setInviting(false)} />}
    </>
  );
}



