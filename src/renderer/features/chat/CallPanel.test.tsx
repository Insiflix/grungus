import { participantAudio } from "../../../domain/calls/ParticipantAudio";
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ICallProvider } from "../../../domain/calls/ICallProvider";
import { CallPanel } from "./CallPanel";
vi.mock("../../app/providers/MatrixProvider", () => ({ mountCall: vi.fn() }));
afterEach(cleanup);

function fixture() {
  let joined = () => {};
  const dispose = vi.fn();
  const hangup = vi.fn().mockResolvedValue(undefined);
  let devices = { audio_enabled: true, video_enabled: false };
  const setDevices = vi.fn(async (state: Partial<typeof devices>) => (devices = { ...devices, ...state }));
  const mount: ICallProvider["mountCall"] = vi.fn((frame, _room, _video, _close, ready, onJoined) => {
    frame.src = "http://localhost/element-call/index.html#?widgetId=test";
    joined = onJoined!;
    ready?.();
    return { dispose, hangup, setDevices };
  });
  const dock = document.createElement("div");
  document.body.append(dock);
  const props = { roomId: "!voice:test", name: "Lounge", video: false, mode: "voice" as const, dock, mount, onClose: vi.fn() };
  const view = render(<CallPanel {...props} />);
  const frame = screen.getByTitle("Element Call: Lounge") as HTMLIFrameElement;
  const status = (data: object) => act(() => { window.dispatchEvent(new MessageEvent("message", { source: frame.contentWindow, origin: "http://localhost", data: { type: "grungus:media-status", widgetId: "test", ...data } })); });
  act(() => joined());
  return { ...view, frame, props, dock, dispose, hangup, setDevices, mount, status };
}

describe("voice channel controls", () => {
  it("shows real latency in the connection tooltip and clears unavailable samples", () => {
    const f = fixture();
    const connection = screen.getByRole("button", { name: /Voice Connected/ });
    expect(connection.getAttribute("data-tooltip")).toBe("Ping unavailable");
    f.status({ pingMs: 42.4 });
    expect(connection.getAttribute("data-tooltip")).toBe("Ping: 42 ms");
    act(() => window.dispatchEvent(new MessageEvent("message", { source: f.frame.contentWindow, origin: "https://evil.test", data: { type: "grungus:media-status", widgetId: "test", pingMs: 1 } })));
    expect(connection.getAttribute("data-tooltip")).toBe("Ping: 42 ms");
    f.status({ pingMs: null });
    expect(connection.getAttribute("data-tooltip")).toBe("Ping unavailable");
    expect(screen.queryByRole("button", { name: "Voice settings" })).toBeNull();
    f.unmount(); f.dock.remove();
  });

  it("joins voice immediately and shows connecting inline without a preview or second Join button", () => {
    let joined = () => {};
    const dock = document.createElement("div"); document.body.append(dock);
    const handle = { dispose: vi.fn(), hangup: vi.fn().mockResolvedValue(undefined) };
    const mount: ICallProvider["mountCall"] = vi.fn((frame, _room, _video, _close, ready, onJoined) => {
      frame.src = "http://localhost/element-call/index.html#?widgetId=test&skipLobby=true";
      joined = onJoined!; ready?.(); return handle;
    });
    const view = render(<CallPanel roomId="!voice:test" name="Lounge" video={false} mode="voice" dock={dock} mount={mount} onClose={vi.fn()} />);
    expect(vi.mocked(mount).mock.calls[0][6]).toEqual({ skipLobby: true });
    expect(document.querySelector(".call-panel--preview")).toBeNull();
    expect(document.querySelector(".call-panel--docked")).not.toBeNull();
    expect(screen.queryByText("Voice Connected")).toBeNull();
    expect((screen.getByRole("button", { name: "Share screen" }) as HTMLButtonElement).disabled).toBe(true);
    act(() => joined());
    expect(screen.getByText("Voice Connected")).toBeDefined();
    expect((screen.getByRole("button", { name: "Share screen" }) as HTMLButtonElement).disabled).toBe(false);
    view.unmount(); dock.remove();
  });
  it("keeps the preview for group calls", () => {
    const mount: ICallProvider["mountCall"] = vi.fn(() => ({ dispose: vi.fn(), hangup: vi.fn().mockResolvedValue(undefined) }));
    const view = render(<CallPanel roomId="!group:test" name="Group" video={true} mount={mount} onClose={vi.fn()} />);
    expect(vi.mocked(mount).mock.calls[0][6]).toEqual({ skipLobby: false });
    expect(document.querySelector(".call-panel--preview")).not.toBeNull();
    view.unmount();
  });
  it("hides chat without losing drafts or reconnecting, and shows the unread count", () => {
    const f = fixture();
    const onToggleChat = vi.fn();
    const chat = <aside className="voice-channel-chat"><textarea aria-label="Draft" defaultValue="Unsent message" /></aside>;
    f.rerender(<CallPanel {...f.props} chat={chat} onToggleChat={onToggleChat} />);
    const draft = screen.getByRole("textbox", { name: "Draft" });
    fireEvent.click(screen.getByRole("button", { name: "Hide voice chat" }));
    expect(onToggleChat).toHaveBeenCalledTimes(1);
    f.rerender(<CallPanel {...f.props} chat={chat} onToggleChat={onToggleChat} chatVisible={false} chatUnreadCount={3} />);
    expect(draft.closest(".voice-chat-slot")?.hasAttribute("hidden")).toBe(true);
    expect(screen.getByRole("button", { name: "Show voice chat, 3 unread messages" }).textContent).toBe("Chat3");
    f.rerender(<CallPanel {...f.props} chat={chat} onToggleChat={onToggleChat} chatVisible={false} chatUnreadCount={123} />);
    expect(screen.getByRole("button", { name: "Show voice chat, 123 unread messages" }).textContent).toBe("Chat99+");
    f.rerender(<CallPanel {...f.props} chat={chat} onToggleChat={onToggleChat} />);
    expect(screen.getByRole("textbox", { name: "Draft" })).toBe(draft);
    expect((draft as HTMLTextAreaElement).value).toBe("Unsent message");
    expect(f.mount).toHaveBeenCalledTimes(1);
    f.unmount(); f.dock.remove();
  });
  it("starts and stops sharing through the widget after revealing the call", async () => {
    const f = fixture();
    const post = vi.spyOn(f.frame.contentWindow!, "postMessage");
    f.rerender(<CallPanel {...f.props} visible={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Share screen" }));
    await waitFor(() => expect(post).toHaveBeenCalledWith({ type: "grungus:toggle-screenshare", widgetId: "test" }, "http://localhost"));
    f.status({ sharing: true, systemAudio: true });
    fireEvent.click(screen.getByRole("button", { name: "Stop sharing screen" }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    f.status({ sharing: false, systemAudio: false });
    expect(screen.getByRole("button", { name: "Share screen" })).toBeDefined();
    f.unmount(); f.dock.remove();
  });
  it("shows sharing failures and lets the user retry", () => {
    const f = fixture();
    fireEvent.click(screen.getByRole("button", { name: "Share screen" }));
    f.status({ shareError: "Not connected yet" });
    expect(screen.getAllByRole("alert")[0].textContent).toBe("Not connected yet");
    expect((screen.getByRole("button", { name: "Share screen" }) as HTMLButtonElement).disabled).toBe(false);
    f.unmount(); f.dock.remove();
  });
  it("keeps the iframe and connection alive when browsing and reopening voice", () => {
    const f = fixture();
    expect(screen.getByRole("region", { name: "Voice controls" }).parentElement).toBe(f.dock);
    f.rerender(<CallPanel {...f.props} visible={false} />);
    expect(f.frame.closest(".call-panel--away")).not.toBeNull();
    f.rerender(<CallPanel {...f.props} visible />);
    expect(screen.getByTitle("Element Call: Lounge")).toBe(f.frame);
    expect(f.mount).toHaveBeenCalledTimes(1);
    expect(f.dispose).not.toHaveBeenCalled();
    f.unmount(); f.dock.remove();
  });
  it.each([true, false])("restores microphone enabled=%s after undeafening", async (enabled) => {
    const f = fixture();
    if (!enabled) {
      fireEvent.click(screen.getByRole("button", { name: "Mute microphone" }));
      await waitFor(() => expect(screen.getByRole("button", { name: "Unmute microphone" })).toBeDefined());
    }
    fireEvent.click(screen.getByRole("button", { name: "Deafen" }));
    await waitFor(() => expect(f.setDevices).toHaveBeenCalledWith({ audio_enabled: false }));
    f.status({ deafened: true });
    expect((screen.getByRole("button", { name: "Unmute microphone" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Undeafen" }));
    f.status({ deafened: false });
    await waitFor(() => expect(f.setDevices).toHaveBeenLastCalledWith({ audio_enabled: enabled }));
    f.unmount(); f.dock.remove();
  });
  it("controls camera and disconnects using the existing call session", async () => {
    const f = fixture();
    fireEvent.click(screen.getByRole("button", { name: "Turn camera on" }));
    await waitFor(() => expect(f.setDevices).toHaveBeenCalledWith({ video_enabled: true }));
    fireEvent.click(screen.getByRole("button", { name: "Disconnect from voice" }));
    expect(f.hangup).toHaveBeenCalledTimes(1);
    f.unmount(); f.dock.remove();
  });
});

it("sends participant gain to the current widget and only accepts its acknowledgement", async () => {
  const f = fixture();
  const post = vi.spyOn(f.frame.contentWindow!, "postMessage");
  let finished = false;
  const request = participantAudio.set(f.props.roomId, "@alice:test", { volume: 150, muted: false }).then(() => { finished = true; });
  const data = post.mock.calls.find(call => call[0].type === "grungus:participant-audio")![0];
  expect(data).toMatchObject({ widgetId: "test", userId: "@alice:test", volume: 150 });
  act(() => window.dispatchEvent(new MessageEvent("message", { source: f.frame.contentWindow, origin: "https://evil.test", data: { type: "grungus:media-status", widgetId: "test", participantAudio: { requestId: data.requestId, success: true } } })));
  await Promise.resolve(); expect(finished).toBe(false);
  f.status({ participantAudio: { requestId: data.requestId, success: true } });
  await request; expect(finished).toBe(true);
  f.unmount(); f.dock.remove();
  expect(participantAudio.connected(f.props.roomId)).toBe(false);
});
