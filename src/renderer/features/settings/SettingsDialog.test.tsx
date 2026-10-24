// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsAuthRequired } from "../../../infrastructure/matrix/MatrixSettings";
import { preferences } from "../../../domain/settings/Preferences";
import { SettingsDialog } from "./SettingsDialog";
import { PreferenceEffects } from "./PreferenceEffects";
import { RoomSettingsDialog } from "./RoomSettingsDialog";
import { VoiceSettings } from "./SettingsPanels";

const mocks = vi.hoisted(() => ({
  settings: {
    addresses: vi.fn().mockResolvedValue([]), capabilities: vi.fn().mockResolvedValue({}), managementUrl: vi.fn().mockResolvedValue(null),
    profile: vi.fn().mockResolvedValue(undefined), devices: vi.fn().mockResolvedValue([
      { device_id: "CURRENT", display_name: "This computer" }, { device_id: "OLD", display_name: "Old computer" },
    ]), revokeDevice: vi.fn().mockResolvedValue(undefined), room: vi.fn(), roomDetails: vi.fn().mockResolvedValue(undefined), roomState: vi.fn().mockResolvedValue(undefined),
    pushRules: vi.fn().mockResolvedValue({ global: {} }), pushers: vi.fn().mockResolvedValue([]), ignoredUsers: vi.fn().mockResolvedValue([]),
  },
  logout: vi.fn(),
}));
vi.mock("../../app/providers/MatrixProvider", () => ({ matrixSettings: mocks.settings, directCalls: {}, useMatrixRuntime: () => ({ joinRoom: vi.fn() }) }));
vi.mock("../../hooks/matrix/useMatrixSession", () => ({ useMatrixSession: () => ({
  session: { userId: "@me:example.org", deviceId: "CURRENT", homeserverUrl: "https://example.org" },
  profile: { displayName: "Alice", avatarUrl: null }, sync: { state: "ready" }, logout: mocks.logout,
}) }));
vi.mock("../../hooks/matrix/useMatrixRooms", () => ({ useMatrixRooms: () => ({ rooms: [] }) }));
vi.mock("../../hooks/matrix/useMatrixSnapshot", () => ({ useMatrixSnapshot: () => ({ identity: null }) }));

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear(); preferences.setAccount(crypto.randomUUID());
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const showSettings = () => render(<><PreferenceEffects /><SettingsDialog onClose={vi.fn()} onOpenIdentity={vi.fn()} onManageRoom={vi.fn()} /></>);

describe("account settings interactions", () => {
  it("opens the log folder, copies its path, and reports file manager failures", async () => {
    const user = userEvent.setup();
    const openFolder = vi.fn().mockResolvedValue(undefined);
    const getPath = vi.fn().mockResolvedValue("/state/grungus/logs");
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("desktop", { logs: { openFolder, getPath }, clipboard: { writeText } });
    showSettings(); await user.click(screen.getByRole("button", { name: "Help & about" }));
    await user.click(screen.getByRole("button", { name: "Open log folder" }));
    expect(openFolder).toHaveBeenCalledOnce();
    await user.click(screen.getByRole("button", { name: "Copy log path" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("/state/grungus/logs"));
    openFolder.mockRejectedValue(new Error("File manager unavailable"));
    await user.click(screen.getByRole("button", { name: "Open log folder" }));
    expect((await screen.findByRole("alert")).textContent).toContain("File manager unavailable");
  });
  it("stops capture if camera permission resolves after closing the settings preview", async () => {
    const user = userEvent.setup();
    let grant!: (stream: MediaStream) => void;
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: vi.fn(() => new Promise<MediaStream>(resolve => { grant = resolve; })), enumerateDevices: vi.fn(async () => []), addEventListener: vi.fn(), removeEventListener: vi.fn() } });
    let pending: Promise<unknown> | undefined;
    const view = render(<VoiceSettings busy={false} onOpenIdentity={vi.fn()} execute={async action => { pending = action(); await pending; return true; }} />);
    await user.click(screen.getByRole("button", { name: "Preview camera & microphone" }));
    view.unmount();
    const stop = vi.fn();
    await act(async () => { grant({ getTracks: () => [{ stop }] } as unknown as MediaStream); await pending; });
    expect(stop).toHaveBeenCalledOnce();
    Reflect.deleteProperty(navigator, "mediaDevices");
  });
  it("keeps local switches, focus, scroll position and navigation stable while toggling", async () => {
    const user = userEvent.setup(); showSettings();
    await user.click(screen.getByRole("button", { name: "Preferences" }));
    const control = screen.getByRole("switch", { name: "Send typing notifications" });
    const content = document.querySelector<HTMLElement>(".settings-content")!;
    content.scrollTop = 210;
    const disabledStates: boolean[] = [];
    const observer = new MutationObserver(() => disabledStates.push((control as HTMLInputElement).disabled));
    observer.observe(control, { attributes: true, attributeFilter: ["disabled"] });
    await user.click(control); await user.click(control); await user.click(control);
    observer.disconnect();
    expect(disabledStates).toEqual([]);
    expect(screen.getByRole("switch", { name: "Send typing notifications" })).toBe(control);
    expect(document.activeElement).toBe(control);
    expect(content.scrollTop).toBe(210);
    expect(control).toHaveProperty("checked", false);
    expect(screen.getByRole("status").textContent).toBe("");
    expect(screen.getByRole("button", { name: "Appearance" })).toHaveProperty("disabled", false);
  });
  it("enables desktop notifications without blocking other settings during permission requests", async () => {
    const user = userEvent.setup();
    let grant!: (permission: NotificationPermission) => void;
    const requestPermission = vi.fn(() => new Promise<NotificationPermission>((resolve) => { grant = resolve; }));
    vi.stubGlobal("Notification", { permission: "default", requestPermission });
    showSettings();
    await user.click(screen.getByRole("button", { name: "Notifications" }));
    const toggle = screen.getByRole("switch", { name: /^Desktop notifications/ });
    await user.click(toggle);
    expect(toggle).toHaveProperty("checked", true);
    expect(toggle).toHaveProperty("disabled", false);
    expect(screen.getByRole("button", { name: "Appearance" })).toHaveProperty("disabled", false);
    await user.click(screen.getByRole("switch", { name: /^Show message content/ }));
    expect(preferences.getSnapshot().notificationPreviews).toBe(true);
    await act(async () => grant("granted"));
    await waitFor(() => expect(preferences.getSnapshot().desktopNotifications).toBe(true));
    expect(requestPermission).toHaveBeenCalledOnce();
    expect(screen.getByRole("status").textContent).toBe("");
  });
  it("reports denied notification permission inline and leaves the menu interactive", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("Notification", { permission: "default", requestPermission: vi.fn().mockResolvedValue("denied") });
    showSettings(); await user.click(screen.getByRole("button", { name: "Notifications" }));
    await user.click(screen.getByRole("switch", { name: /^Desktop notifications/ }));
    expect((await screen.findByRole("alert")).textContent).toContain("Notification permission was not granted");
    expect(preferences.getSnapshot().desktopNotifications).toBe(false);
    expect(screen.getByRole("switch", { name: /^Desktop notifications/ })).toHaveProperty("checked", false);
    await user.click(screen.getByRole("switch", { name: /^Show message content/ }));
    expect(preferences.getSnapshot().notificationPreviews).toBe(true);
  });
  it("sends a test notification using an already granted OS permission", async () => {
    const user = userEvent.setup();
    const requestPermission = vi.fn().mockResolvedValue("granted");
    const notify = Object.assign(vi.fn(), { permission: "granted", requestPermission });
    vi.stubGlobal("Notification", notify);
    showSettings(); await user.click(screen.getByRole("button", { name: "Notifications" }));
    await user.click(screen.getByRole("switch", { name: /^Desktop notifications/ }));
    expect(requestPermission).not.toHaveBeenCalled();
    expect(preferences.getSnapshot().desktopNotifications).toBe(true);
    await user.click(screen.getByRole("button", { name: "Send test notification" }));
    expect(notify).toHaveBeenCalledWith("Grungus", expect.objectContaining({ body: "Your notifications are working." }));
  });
  it("opens every settings category without requiring unsupported browser capabilities", async () => {
    const user = userEvent.setup(); showSettings();
    for (const category of ["Appearance", "Notifications", "Preferences", "Sessions", "Security & privacy", "Blocked users", "Voice & video", "Rooms & spaces", "Keyboard", "Help & about", "General"]) {
      await user.click(screen.getByRole("button", { name: category }));
      expect(screen.getByRole("heading", { name: category, level: 2 })).toBeTruthy();
    }
  });
  it("saves profile edits through the account API", async () => {
    const user = userEvent.setup(); showSettings();
    const input = screen.getByLabelText("Display name");
    await user.clear(input); await user.type(input, "New name");
    await user.click(screen.getByRole("button", { name: "Save display name" }));
    await waitFor(() => expect(mocks.settings.profile).toHaveBeenCalledWith("New name"));
    expect(await screen.findByRole("status")).toHaveProperty("textContent", "Changes saved.");
  });
  it("persists preferences and immediately applies the selected theme", async () => {
    const user = userEvent.setup(); showSettings();
    await user.click(screen.getByRole("button", { name: "Appearance" }));
    await user.click(screen.getByRole("button", { name: "Light" }));
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("light"));
    expect(preferences.getSnapshot().theme).toBe("light");
    await user.click(screen.getByRole("button", { name: "Preferences" }));
    await user.click(screen.getByRole("switch", { name: "Send typing notifications" }));
    expect(preferences.getSnapshot().sendTyping).toBe(false);
  });
  it("filters settings categories without rendering placeholder pages", async () => {
    const user = userEvent.setup(); showSettings();
    await user.type(screen.getByRole("textbox", { name: "Search settings" }), "camera");
    expect(screen.getByRole("button", { name: "Voice & video" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Appearance" })).toBeNull();
  });
  it("requires confirmation and server authentication before revoking another session", async () => {
    const user = userEvent.setup();
    mocks.settings.revokeDevice.mockRejectedValueOnce(new SettingsAuthRequired({ session: "uia-session", flows: [{ stages: ["m.login.password"] }] }));
    showSettings();
    await user.click(screen.getByRole("button", { name: "Sessions" }));
    await user.click(await screen.findByRole("button", { name: /^Sign out/ }));
    expect(mocks.settings.revokeDevice).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Confirm sign out" }));
    await user.type(await screen.findByLabelText("Current password"), "current-password");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(mocks.settings.revokeDevice).toHaveBeenLastCalledWith("OLD", {
      type: "m.login.password", session: "uia-session", identifier: { type: "m.id.user", user: "@me:example.org" }, password: "current-password",
    }));
    expect(await screen.findByText("Session signed out.")).toBeTruthy();
  });
  it("shows API errors without announcing a successful save", async () => {
    const user = userEvent.setup(); mocks.settings.profile.mockRejectedValueOnce(new Error("Permission denied")); showSettings();
    await user.click(screen.getByRole("button", { name: "Save display name" }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Permission denied");
    expect(screen.queryByText("Changes saved.")).toBeNull();
  });
});

const baseRoom = {
  id: "!room:example.org", name: "Forest room", topic: "Hello", space: false, encrypted: false,
  avatar: "", joinRule: "invite", allowedSpaces: [], history: "shared", guestAccess: "forbidden",
  directory: "private", aliases: [], canonicalAlias: "", power: {}, level: 0, ownId: "@me:example.org",
  canDetails: false, canAvatar: false, canAccess: false, canHistory: false, canGuestAccess: false,
  canPermissions: false, canEncrypt: false, canAliases: false, canChildren: false,
  canInvite: false, canKick: false, canBan: false, members: [], children: [],
};
describe("room settings interactions", () => {
  it("disables room edits when the current role lacks permission", async () => {
    mocks.settings.room.mockResolvedValue(baseRoom);
    render(<RoomSettingsDialog roomId={baseRoom.id} onClose={vi.fn()} />);
    expect(await screen.findByLabelText("Room name")).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Save details" })).toHaveProperty("disabled", true);
    expect(screen.getByText(/Your role cannot change/)).toBeTruthy();
  });
  it("requires explicit acknowledgement before permanently enabling encryption", async () => {
    const user = userEvent.setup(); mocks.settings.room.mockResolvedValue({ ...baseRoom, canEncrypt: true });
    render(<RoomSettingsDialog roomId={baseRoom.id} onClose={vi.fn()} />);
    await screen.findByLabelText("Room name");
    await user.click(screen.getByRole("button", { name: "Security & access" }));
    expect(screen.getByRole("button", { name: "Enable encryption permanently" })).toHaveProperty("disabled", true);
    await user.click(screen.getByRole("switch", { name: "I understand that encryption cannot be turned off" }));
    await user.click(screen.getByRole("button", { name: "Enable encryption permanently" }));
    await waitFor(() => expect(mocks.settings.roomState).toHaveBeenCalledWith(baseRoom.id, "m.room.encryption", { algorithm: "m.megolm.v1.aes-sha2" }));
  });
});

