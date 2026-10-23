// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { MatrixRoom } from "../../../domain/matrix/MatrixTypes";
import { RoomSidebar } from "./RoomSidebar";

const mocks = vi.hoisted(() => ({ selectRoom: vi.fn(), joinRoom: vi.fn(async () => true), discovered: {} as Record<string, MatrixRoom[]> }));
const base: MatrixRoom = { id: "!room:example", name: "General", avatarUrl: null, topic: null, unreadCount: 0, highlightCount: 0, isEncrypted: true, membership: "join", memberCount: 2 };
const rooms = [base, { ...base, id: "!slitix:example", name: "Slitix", isDirect: true }, { ...base, id: "!outside:example", name: "Outside" }];
vi.mock("../../hooks/matrix/useMatrixRooms", () => ({ useMatrixRooms: (filter: string) => ({ rooms: rooms.filter(room => room.name.toLowerCase().includes(filter.trim().toLowerCase())), spaceRooms: mocks.discovered, selectRoom: mocks.selectRoom, joinRoom: mocks.joinRoom }) }));
vi.mock("../../hooks/matrix/useMatrixSession", () => ({ useMatrixSession: () => ({ session: null, profile: null, sync: { state: "ready" } }) }));
vi.mock("./InvitationList", () => ({ InvitationList: () => null }));
vi.mock("./PeopleDialog", () => ({ PeopleDialog: () => null }));
vi.mock("./CreateChannelDialog", () => ({ CreateChannelDialog: () => null }));
vi.mock("../../components/common/Avatar", () => ({ Avatar: () => null }));
afterEach(() => { cleanup(); vi.clearAllMocks(); mocks.discovered = {}; });
describe("chat search", () => {
  it("finds and opens an existing DM even when a space is selected", () => {
    render(<RoomSidebar space={{ ...base, isSpace: true, childRoomIds: [base.id] }} onOpenIdentity={vi.fn()} onOpenSettings={vi.fn()} onManageSpace={vi.fn()} />);
    expect(screen.queryByText("Slitix")).toBeNull();
    fireEvent.change(screen.getByRole("textbox", { name: "Find a room or direct message" }), { target: { value: "Slitix" } });
    fireEvent.click(screen.getByRole("listitem"));
    expect(mocks.selectRoom).toHaveBeenCalledWith("!slitix:example");
    expect(screen.getByText("Direct message")).toBeTruthy();
  });
  it("searches rooms outside the selected space and restores the space filter after clearing", () => {
    render(<RoomSidebar space={{ ...base, isSpace: true, childRoomIds: [base.id] }} onOpenIdentity={vi.fn()} onOpenSettings={vi.fn()} onManageSpace={vi.fn()} />);
    const search = screen.getByRole("textbox", { name: "Find a room or direct message" });
    fireEvent.change(search, { target: { value: "Outside" } });
    expect(screen.getByText("Outside")).toBeTruthy();
    fireEvent.change(search, { target: { value: "" } });
    expect(screen.queryByText("Outside")).toBeNull();
    expect(screen.getByRole("button", { name: "Open text channel General" })).toBeTruthy();
  });
  it("discovers unjoined public channels and joins through the advertised servers", async () => {
    mocks.discovered["!server"] = [{ ...base, id: "!public:remote", name: "public-chat", membership: "leave", joinRule: "public", viaServers: ["remote"] }];
    render(<RoomSidebar space={{ ...base, id: "!server", isSpace: true }} onOpenIdentity={vi.fn()} onOpenSettings={vi.fn()} onManageSpace={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Open text channel public-chat" }));
    await waitFor(() => expect(mocks.joinRoom).toHaveBeenCalledWith("!public:remote", ["remote"]));
  });
  it("shows participants under voice channels, keeps private channels locked, and opens voice", async () => {
    const voice = { ...base, id: "!voice", name: "Lounge", roomType: "org.matrix.msc3417.call", membership: "leave" as const, joinRule: "restricted" };
    mocks.discovered["!server"] = [voice, { ...base, id: "!private", name: "staff", membership: "leave", joinRule: "invite" }];
    const onJoinVoice = vi.fn();
    render(<RoomSidebar space={{ ...base, id: "!server", isSpace: true }} calls={[{ roomId: voice.id, name: voice.name, participants: 1, members: [{ id: "@alice:example", displayName: "Alice", avatarUrl: null }] }]} onJoinVoice={onJoinVoice} onOpenIdentity={vi.fn()} onOpenSettings={vi.fn()} onManageSpace={vi.fn()} />);
    expect(within(screen.getByRole("list", { name: "People in Lounge" })).getByText("Alice")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Open text channel staff, invitation required" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Join voice channel Lounge" }));
    await waitFor(() => expect(onJoinVoice).toHaveBeenCalledWith(voice));
    expect(mocks.joinRoom).toHaveBeenCalledWith(voice.id, undefined);
  });
  it("does not start a voice call when joining the channel fails", async () => {
    mocks.joinRoom.mockResolvedValueOnce(false);
    mocks.discovered["!server"] = [{ ...base, id: "!voice", name: "Lounge", roomType: "org.matrix.msc3417.call", membership: "leave", joinRule: "public" }];
    const onJoinVoice = vi.fn();
    render(<RoomSidebar space={{ ...base, id: "!server", isSpace: true }} onJoinVoice={onJoinVoice} onOpenIdentity={vi.fn()} onOpenSettings={vi.fn()} onManageSpace={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Join voice channel Lounge" }));
    await waitFor(() => expect((screen.getByRole("button", { name: "Join voice channel Lounge" }) as HTMLButtonElement).disabled).toBe(false));
    expect(onJoinVoice).not.toHaveBeenCalled();
  });
  it("allows a join attempt when the hierarchy omits the channel access rule", async () => {
    const voice = { ...base, id: "!voice", name: "Garle Girk", roomType: "org.matrix.msc3417.call", membership: "leave" as const };
    mocks.discovered["!server"] = [voice];
    const onJoinVoice = vi.fn();
    render(<RoomSidebar space={{ ...base, id: "!server", isSpace: true }} onJoinVoice={onJoinVoice} onOpenIdentity={vi.fn()} onOpenSettings={vi.fn()} onManageSpace={vi.fn()} />);
    const channel = screen.getByRole("button", { name: "Join voice channel Garle Girk" }) as HTMLButtonElement;
    expect(channel.disabled).toBe(false);
    expect(channel.querySelector(".lucide-lock-keyhole")).toBeNull();
    fireEvent.click(channel);
    await waitFor(() => expect(onJoinVoice).toHaveBeenCalledWith(voice));
    expect(mocks.joinRoom).toHaveBeenCalledWith(voice.id, undefined);
  });
});
