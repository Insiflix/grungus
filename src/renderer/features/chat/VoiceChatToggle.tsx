import { MessageSquare } from "lucide-react";

export function VoiceChatToggle({ visible, unreadCount, onToggle, controls }: { visible: boolean; unreadCount: number; onToggle: () => void; controls: string }) {
  const unread = !visible ? Math.max(0, unreadCount) : 0;
  const label = `${visible ? "Hide" : "Show"} voice chat${unread ? `, ${unread} unread ${unread === 1 ? "message" : "messages"}` : ""}`;
  return <button type="button" className="voice-chat-toggle" aria-label={label} data-tooltip={label} aria-expanded={visible} aria-controls={controls} onClick={onToggle}>
    <MessageSquare size={17} /><span>Chat</span>
    {unread > 0 && <b className="mention-badge" aria-live="polite" aria-atomic="true">{unread > 99 ? "99+" : unread}</b>}
  </button>;
}
