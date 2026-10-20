// @vitest-environment jsdom
import { useEffect } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTimelineScroll } from "./useTimelineScroll";

let contentHeight = 2000;
let viewportHeight = 500;
let resize: () => void;
const disconnect = vi.fn();
const observe = vi.fn();
const positionsAfterPaint = vi.fn();

function Timeline({ roomId = "alice", messages = ["latest"] }: { roomId?: string | null; messages?: string[] }) {
  const { timelineRef, contentRef, onScroll, scrollToLatest } = useTimelineScroll(roomId, messages);
  useEffect(() => { positionsAfterPaint(timelineRef.current?.scrollTop); });
  if (!roomId) return null;
  return <section ref={timelineRef} data-testid="timeline" onScroll={onScroll}>
    <div ref={contentRef}>{messages.join(",")}</div>
    <button onClick={scrollToLatest}>Media loaded</button>
  </section>;
}

beforeEach(() => {
  contentHeight = 2000;
  viewportHeight = 500;
  vi.clearAllMocks();
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(() => contentHeight);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(() => viewportHeight);
  vi.spyOn(HTMLElement.prototype, "scrollTop", "get").mockImplementation(function (this: HTMLElement) {
    return Number(this.dataset.scrollTop ?? 0);
  });
  vi.spyOn(HTMLElement.prototype, "scrollTop", "set").mockImplementation(function (this: HTMLElement, top: number) {
    this.dataset.scrollTop = String(Math.max(0, Math.min(top, contentHeight - viewportHeight)));
  });
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: () => void) { resize = callback; }
    observe = observe;
    disconnect = disconnect;
  });
});

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("timeline initial positioning", () => {
  it("positions cached messages at the bottom before passive effects run", () => {
    render(<Timeline />);
    expect(positionsAfterPaint).toHaveBeenLastCalledWith(1500);
    expect(observe).toHaveBeenCalledTimes(2);
  });

  it("positions the first asynchronous message batch before paint", () => {
    const view = render(<Timeline messages={[]} />);
    fireEvent.scroll(screen.getByTestId("timeline"), { target: { scrollTop: 0 } });
    contentHeight = 4000;
    view.rerender(<Timeline messages={["older", "latest"]} />);
    expect(positionsAfterPaint).toHaveBeenLastCalledWith(3500);
  });

  it("resets bottom tracking when switching rooms after scrolling up", () => {
    const view = render(<Timeline />);
    fireEvent.scroll(screen.getByTestId("timeline"), { target: { scrollTop: 100 } });
    contentHeight = 3000;
    view.rerender(<Timeline roomId="bob" />);
    expect(positionsAfterPaint).toHaveBeenLastCalledWith(2500);
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it("opens at the bottom after transitioning from no selected room", () => {
    const view = render(<Timeline roomId={null} messages={[]} />);
    view.rerender(<Timeline />);
    expect(positionsAfterPaint).toHaveBeenLastCalledWith(1500);
  });

  it("stays pinned through media loading, new messages and viewport resizing", () => {
    const view = render(<Timeline />);
    contentHeight = 3000;
    act(() => resize());
    expect(screen.getByTestId("timeline").scrollTop).toBe(2500);
    contentHeight = 4000;
    fireEvent.click(screen.getByText("Media loaded"));
    expect(screen.getByTestId("timeline").scrollTop).toBe(3500);
    viewportHeight = 300;
    act(() => resize());
    expect(screen.getByTestId("timeline").scrollTop).toBe(3700);
    contentHeight = 4500;
    view.rerender(<Timeline messages={["latest", "new"]} />);
    expect(positionsAfterPaint).toHaveBeenLastCalledWith(4200);
  });

  it("does not pull readers to the bottom when history or new messages arrive", () => {
    const view = render(<Timeline />);
    const timeline = screen.getByTestId("timeline");
    fireEvent.scroll(timeline, { target: { scrollTop: 100 } });
    contentHeight = 3000;
    view.rerender(<Timeline messages={["older", "latest", "new"]} />);
    act(() => resize());
    fireEvent.click(screen.getByText("Media loaded"));
    expect(timeline.scrollTop).toBe(100);
    fireEvent.scroll(timeline, { target: { scrollTop: 2500 } });
    contentHeight = 4000;
    act(() => resize());
    expect(timeline.scrollTop).toBe(3500);
  });

  it("disconnects observers on unmount", () => {
    const view = render(<Timeline />);
    view.unmount();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
