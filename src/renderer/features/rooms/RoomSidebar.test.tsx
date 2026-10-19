// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { MatrixRoom } from "../../../domain/matrix/MatrixTypes";
import { RoomSidebar } from "./RoomSidebar";

const mocks = vi.hoisted(() => ({ selectRoom: vi.fn() }));
const base: MatrixRoom = { id: "!room:example", name: "General", avatarUrl: null, topic: null, unreadCount: 0, highlightCount: 0, isEncrypted: true, membership: "join", memberCount: 2 };
const rooms = [base, { ...base, id: "!slitix:example", name: "Slitix", isDirect: true }, { ...base, id: "!outside:example", name: "Outside" }];
vi.mock("../../hooks/matrix/useMatrixRooms", () => ({ useMatrixRooms: (filter: string) => ({ rooms: rooms.filter(room => room.name.toLowerCase().includes(filter.trim().toLowerCase())), selectRoom: mocks.selectRoom, joinRoom: vi.fn() }) }));
vi.mock("../../hooks/matrix/useMatrixSession", () => ({ useMatrixSession: () => ({ session: null, profile: null, sync: { state: "ready" } }) }));
vi.mock("./InvitationList", () => ({ InvitationList: () => null }));
vi.mock("./PeopleDialog", () => ({ PeopleDialog: () => null }));
vi.mock("../../components/common/Avatar", () => ({ Avatar: () => null }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
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
    expect(screen.getByText("General", { selector: ".room-row strong" })).toBeTruthy();
  });
});
