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
});
