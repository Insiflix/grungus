// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { MatrixRoom } from "../../../domain/matrix/MatrixTypes";
import { SpaceChannels } from "./SpaceChannels";
vi.mock("./PeopleDialog", () => ({ PeopleDialog: ({ room }: { room: MatrixRoom }) => <div role="dialog">Invite to {room.name}</div> }));
afterEach(cleanup);
const room: MatrixRoom = { id: "!general:test", name: "General", avatarUrl: null, topic: null, unreadCount: 0, highlightCount: 0, isEncrypted: true, membership: "join", memberCount: 3 };
it("opens channel settings only for a channel administrator and keeps invitations separate", () => {
  const onSettings = vi.fn(), onOpen = vi.fn();
  const view = render(<SpaceChannels rooms={[room]} selectedRoomId={room.id} calls={[]} onOpen={onOpen} callActive={false} onSettings={onSettings} />);
  expect(screen.queryByRole("button", { name: "Settings for General" })).toBeNull();
  view.rerender(<SpaceChannels rooms={[{ ...room, canManage: true }]} selectedRoomId={room.id} calls={[]} onOpen={onOpen} callActive={false} onSettings={onSettings} />);
  fireEvent.click(screen.getByRole("button", { name: "Settings for General" }));
  expect(onSettings).toHaveBeenCalledWith(room.id);
  expect(onOpen).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Invite people to General" }));
  expect(screen.getByRole("dialog").textContent).toBe("Invite to General");
});
