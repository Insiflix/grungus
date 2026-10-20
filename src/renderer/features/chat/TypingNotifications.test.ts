import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TypingNotifications } from "./TypingNotifications";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("typing notification scheduling", () => {
  it("does not wake sync for every key in a continuous burst", () => {
    const notify = vi.fn();
    const typing = new TypingNotifications(notify);
    for (let key = 0; key < 100; key++) { typing.update(true); vi.advanceTimersByTime(20); }
    expect(notify).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(notify).toHaveBeenCalledExactlyOnceWith(true);
    typing.stop();
  });

  it("limits refreshes while preserving the idle stop notification", () => {
    const notify = vi.fn();
    const typing = new TypingNotifications(notify);
    typing.update(true); vi.advanceTimersByTime(300);
    for (let word = 0; word < 3; word++) { typing.update(true); vi.advanceTimersByTime(1000); }
    expect(notify).toHaveBeenCalledExactlyOnceWith(true);
    typing.update(true); vi.advanceTimersByTime(1000);
    expect(notify.mock.calls).toEqual([[true], [true]]);
    vi.advanceTimersByTime(3000);
    expect(notify.mock.calls).toEqual([[true], [true], [false]]);
  });

  it("cancels queued notifications when sent, cleared, or unmounted", () => {
    const notify = vi.fn();
    const typing = new TypingNotifications(notify);
    typing.update(true); typing.stop(); vi.advanceTimersByTime(10000);
    expect(notify).not.toHaveBeenCalled();
    typing.update(true); vi.advanceTimersByTime(300); typing.update(false);
    expect(notify.mock.calls).toEqual([[true], [false]]);
    vi.advanceTimersByTime(10000);
    expect(notify).toHaveBeenCalledTimes(2);
  });
});
