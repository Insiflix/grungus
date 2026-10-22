// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MatrixEvent, type MatrixClient, type Room } from "matrix-js-sdk";
import { preferences } from "../../domain/settings/Preferences";
import { MatrixNotifications } from "./MatrixNotifications";

const notify = vi.fn();
class FakeNotification {
  static permission = "granted";
  onclick: (() => void) | null = null;
  constructor(title: string, options: NotificationOptions) { notify(title, options); }
  close() {}
}
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear(); preferences.setAccount(crypto.randomUUID()); preferences.update({ desktopNotifications: true });
  vi.stubGlobal("Notification", FakeNotification);
  vi.spyOn(document, "hasFocus").mockReturnValue(false);
});
function fixture() {
  const sdk = { getUserId: () => "@me:example.org", isUserIgnored: vi.fn(() => false), getPushActionsForEvent: vi.fn(() => ({ notify: true, tweaks: {} })) };
  const room = { roomId: "!room:example.org", name: "Forest room", getMember: () => ({ name: "Alice" }) };
  const event = new MatrixEvent({ event_id: "$message", type: "m.room.message", room_id: room.roomId, sender: "@alice:example.org", content: { msgtype: "m.text", body: "Secret message" } });
  const manager = new MatrixNotifications();
  const send = () => manager.live(sdk as unknown as MatrixClient, event, room as unknown as Room);
  return { sdk, room, manager, event, send };
}
describe("desktop notifications", () => {
  it("hides message content unless previews are explicitly enabled", () => {
    const { send } = fixture(); send();
    expect(notify).toHaveBeenCalledWith("Forest room", expect.objectContaining({ body: "New activity in Grungus" }));
    expect(JSON.stringify(notify.mock.calls)).not.toContain("Secret message");
  });
  it("honors notification rules and blocked users", () => {
    const { sdk, send } = fixture(); sdk.getPushActionsForEvent.mockReturnValue({ notify: false, tweaks: {} }); send();
    expect(notify).not.toHaveBeenCalled();
    const blocked = fixture(); blocked.sdk.isUserIgnored.mockReturnValue(true); blocked.send();
    expect(notify).not.toHaveBeenCalled();
  });
  it("suppresses duplicates and messages in the focused room", () => {
    const { manager, room, send } = fixture(); send(); send();
    expect(notify).toHaveBeenCalledOnce();
    notify.mockClear(); manager.clear(); manager.viewedRoom = room.roomId;
    vi.spyOn(document, "hasFocus").mockReturnValue(true); send();
    expect(notify).not.toHaveBeenCalled();
  });
  it("shows opted-in previews and respects OS permission changes", () => {
    preferences.update({ notificationPreviews: true });
    const { send } = fixture(); send();
    expect(notify).toHaveBeenCalledWith("Forest room", expect.objectContaining({ body: "Alice: Secret message" }));
    notify.mockClear(); FakeNotification.permission = "denied"; fixture().send();
    expect(notify).not.toHaveBeenCalled(); FakeNotification.permission = "granted";
  });
  it("uses the DM sender name and profile picture without duplicating their name in the preview", async () => {
    preferences.update({ notificationPreviews: true });
    const { sdk, room, event } = fixture();
    Object.assign(sdk, { getAccountData: () => ({ getContent: () => ({ "@alice:example.org": [room.roomId] }) }), getHomeserverUrl: () => "https://example.org" });
    Object.assign(room, { getMember: () => ({ name: "Alice", getMxcAvatarUrl: () => "mxc://example.org/alice" }) });
    const avatar = vi.fn().mockResolvedValue("data:image/png;base64,avatar");
    new MatrixNotifications(avatar).live(sdk as unknown as MatrixClient, event, room as unknown as Room);
    await vi.waitFor(() => expect(notify).toHaveBeenCalledWith("Alice", expect.objectContaining({ body: "Secret message", icon: "data:image/png;base64,avatar" })));
    expect(avatar).toHaveBeenCalledWith(expect.stringContaining("/alice"), "Alice");
  });
  it("uses the canonical server avatar and channel name", async () => {
    const { sdk, room, event } = fixture();
    const parent = (id: string, canonical: boolean) => ({ getContent: () => ({ via: ["example.org"], canonical }), getStateKey: () => id });
    const server = { name: "Forest server", isSpaceRoom: () => true, getMxcAvatarUrl: () => "mxc://example.org/server" };
    Object.assign(sdk, { getHomeserverUrl: () => "https://example.org", getRoom: (id: string) => id === "!canonical" ? server : undefined });
    Object.assign(room, { currentState: { getStateEvents: () => [parent("!other", false), parent("!canonical", true)] } });
    const avatar = vi.fn().mockResolvedValue("data:image/png;base64,server");
    new MatrixNotifications(avatar).live(sdk as unknown as MatrixClient, event, room as unknown as Room);
    await vi.waitFor(() => expect(notify).toHaveBeenCalledWith("Forest room", expect.objectContaining({ icon: "data:image/png;base64,server" })));
    expect(avatar).toHaveBeenCalledWith(expect.stringContaining("/server"), "Forest server");
  });
  it("does not deliver a pending avatar notification after the session is cleared", async () => {
    const { sdk, room, event } = fixture();
    let resolve!: (value: string) => void;
    const manager = new MatrixNotifications(() => new Promise<string>(done => { resolve = done; }));
    manager.live(sdk as unknown as MatrixClient, event, room as unknown as Room);
    manager.clear(); resolve("data:image/png;base64,test");
    await new Promise(done => setTimeout(done, 0));
    expect(notify).not.toHaveBeenCalled();
  });
  it("still delivers text if avatar rendering fails", async () => {
    const { sdk, room, event } = fixture();
    new MatrixNotifications(() => Promise.reject(new Error("No canvas"))).live(sdk as unknown as MatrixClient, event, room as unknown as Room);
    await vi.waitFor(() => expect(notify).toHaveBeenCalledOnce());
  });

});
