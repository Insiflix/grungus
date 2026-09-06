import { useEffect, useRef, useState } from "react";
import type { MatrixRoom } from "../../../domain/matrix/MatrixTypes";
import { LockKeyhole as LockIcon, UsersRound as UsersIcon } from "lucide-react";
import { useMatrixTimeline } from "../../hooks/matrix/useMatrixTimeline";
import { MessageComposer } from "./MessageComposer";
import { MessageRow } from "./MessageRow";

interface TimelinePanelProps {
  room: MatrixRoom | null;
}

export function TimelinePanel({ room }: TimelinePanelProps) {
  const { messages, typingMembers, loadOlder, sendMessage, setTyping, toggleReaction } =
    useMatrixTimeline(room?.id ?? null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const endRef = useRef<HTMLDivElement>(null);
  const previousRoom = useRef<string | null>(null);
  const previousLength = useRef(0);

  useEffect(() => {
    const changedRoom = previousRoom.current !== room?.id;
    const appended = messages.length > previousLength.current;
    if (changedRoom || appended) endRef.current?.scrollIntoView({ behavior: changedRoom ? "instant" : "smooth" });
    previousRoom.current = room?.id ?? null;
    previousLength.current = messages.length;
  }, [messages.length, room?.id]);

  useEffect(() => setHasMore(true), [room?.id]);

  if (!room) {
    return (
      <div className="empty-chat">
        <div className="empty-chat__glyph">G</div>
        <h2>Select a room</h2>
        <p>Choose one from the room list.</p>
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
          {room.isEncrypted && <span className="encrypted-pill"><LockIcon /> Encrypted</span>}
          <span className="member-count"><UsersIcon /> {room.memberCount}</span>
        </div>
      </header>

      <section className="timeline" aria-label={`${room.name} message timeline`}>
        <div className="timeline__inner">
          {hasMore && messages.length > 0 && (
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
            const grouped = Boolean(
              previous &&
                previous.sender.id === message.sender.id &&
                message.timestamp - previous.timestamp < 5 * 60_000,
            );
            return (
              <MessageRow
                key={message.id}
                message={message}
                grouped={grouped}
                onReact={(key) => void toggleReaction(message, key)}
              />
            );
          })}
          {messages.length === 0 && <p className="timeline-empty">No messages loaded yet.</p>}
          <div ref={endRef} />
        </div>
      </section>

      <div className="composer-region">
        <div className="typing-line" aria-live="polite">
          {typingMembers.length > 0 && (
            <><span className="typing-dots"><i /><i /><i /></span> {typingMembers.map((member) => member.displayName).join(", ")} {typingMembers.length === 1 ? "is" : "are"} typing</>
          )}
        </div>
        <MessageComposer
          roomName={room.name}
          onSend={sendMessage}
          onTyping={setTyping}
        />
      </div>
    </>
  );
}



