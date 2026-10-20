import { useCallback, useLayoutEffect, useRef } from "react";

/** Position the live timeline before paint, including asynchronously loaded history. */
export function useTimelineScroll(roomId: string | null, messages: readonly unknown[]) {
  const timelineRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const previous = useRef<{ roomId: string | null; hasMessages: boolean }>({ roomId: null, hasMessages: false });

  const scrollToLatest = useCallback(() => {
    const timeline = timelineRef.current;
    if (timeline && nearBottom.current) timeline.scrollTop = timeline.scrollHeight;
  }, []);

  useLayoutEffect(() => {
    const changedRoom = previous.current.roomId !== roomId;
    const firstMessages = !previous.current.hasMessages && messages.length > 0;
    if (changedRoom || firstMessages) nearBottom.current = true;
    // Do not animate initial loading or fight media resizing with a smooth scroll.
    scrollToLatest();
    previous.current = { roomId, hasMessages: messages.length > 0 };
  }, [roomId, messages, scrollToLatest]);

  useLayoutEffect(() => {
    const timeline = timelineRef.current;
    const content = contentRef.current;
    if (!timeline || !content) return;
    // Images, decryption, and composer/window resizing can change the bottom
    // without changing the number of messages. ResizeObserver runs before paint.
    const observer = new ResizeObserver(scrollToLatest);
    observer.observe(timeline);
    observer.observe(content);
    return () => observer.disconnect();
  }, [roomId, scrollToLatest]);

  const onScroll = useCallback(() => {
    const timeline = timelineRef.current;
    if (timeline) nearBottom.current = timeline.scrollHeight - timeline.scrollTop - timeline.clientHeight < 160;
  }, []);

  return { timelineRef, contentRef, onScroll, scrollToLatest };
}
