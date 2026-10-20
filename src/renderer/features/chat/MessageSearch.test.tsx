// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MessageSearch } from "./MessageSearch";
import type { MatrixRoom, MatrixMessage } from "../../../domain/matrix/MatrixTypes";
const mocks = vi.hoisted(() => ({ search: vi.fn() }));
vi.mock("../../app/providers/MatrixProvider", () => ({ useMatrixRuntime: () => ({ searchMessages: mocks.search }) }));
const room: MatrixRoom = { id: "!one", name: "General", avatarUrl: null, topic: null, unreadCount: 0, highlightCount: 0, isEncrypted: true, membership: "join", memberCount: 2 };
const message: MatrixMessage = { id: "$result", roomId: room.id, sender: { id: "@alice:test", displayName: "Alice", avatarUrl: null }, timestamp: 1, type: "image", body: "Launch photo", edited: false, replyTo: null, reactions: [], sendState: "sent", isOwn: false, isRedacted: false };
beforeEach(() => {
  mocks.search.mockReset();
});
afterEach(cleanup);
it("searches all joined server channels with combined filters and opens a result", async () => {
  mocks.search.mockResolvedValue({ messages: [message], scanned: 30, roomsDone: 2, totalRooms: 2, undecryptable: 0, limited: false });
  const open = vi.fn().mockResolvedValue(undefined);
  render(<MessageSearch room={room} serverName="Server" serverRooms={[room, { ...room, id: "!two", name: "Other" }]} onOpen={open} />);
  fireEvent.focus(screen.getByRole("searchbox"));
  fireEvent.click(screen.getByRole("button", { name: /More filters/ }));
  fireEvent.click(screen.getByLabelText("Search scope"));
  fireEvent.click(screen.getByRole("option", {name:"Server: Server"}));
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "launch" } });
  fireEvent.change(screen.getByLabelText("Filter by sender"), { target: { value: "@alice:test" } });
  fireEvent.change(screen.getByLabelText("Messages from date"), { target: { value: "2026-10-01" } });
  fireEvent.change(screen.getByLabelText("Messages through date"), { target: { value: "2026-10-20" } });
  fireEvent.click(screen.getByLabelText("Filter by media"));
  fireEvent.click(screen.getByRole("option", {name:"Images"}));
  fireEvent.click(screen.getByRole("button", { name: /^Search$/ }));
  await waitFor(() => expect(mocks.search).toHaveBeenCalled());
  expect(mocks.search.mock.calls[0][0]).toMatchObject({ roomIds: ["!one", "!two"], text: "launch", sender: "@alice:test", media: "image", after: expect.any(Number), before: expect.any(Number) });
  fireEvent.click(await screen.findByRole("button", { name: /Launch photo/ }));
  await waitFor(() => expect(open).toHaveBeenCalledWith(message)); expect(screen.queryByRole("region", { name: "Message search" })).toBeNull();
});
it("stops a long history search without accepting stale results", async () => {
  mocks.search.mockImplementation(() => new Promise(() => {}));
  render(<MessageSearch room={room} serverRooms={[]} onOpen={vi.fn()} />);
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "word" } });
  fireEvent.click(screen.getByRole("button", { name: /^Search$/ }));
  fireEvent.click(await screen.findByRole("button", { name: "Stop search" }));
  expect(mocks.search.mock.calls[0][1].aborted).toBe(true);
  expect(screen.getByRole("status").textContent).toContain("Search stopped");
});

it("dismisses on outside click, focus leaving, and Escape while keeping filters interactive", () => {
  render(<><MessageSearch room={room} serverRooms={[room]} onOpen={vi.fn()} /><button>Outside</button></>);
  const field = screen.getByRole("searchbox");
  fireEvent.focus(field);
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(screen.getByRole("button", {name: /More filters/}));
  fireEvent.focus(screen.getByLabelText("Filter by sender"));
  expect(screen.getByRole("region", {name:"Message search"})).toBeTruthy();
  fireEvent.pointerDown(screen.getByText("Outside"));
  expect(screen.queryByRole("region")).toBeNull();
  fireEvent.focus(field); fireEvent.focusIn(screen.getByText("Outside"));
  expect(screen.queryByRole("region")).toBeNull();
  fireEvent.focus(field); fireEvent.keyDown(field, {key:"Escape"});
  expect(screen.queryByRole("region")).toBeNull();
});
it("accepts inline Discord-style filters", async () => {
  mocks.search.mockResolvedValue({messages:[],scanned:0,roomsDone:1,totalRooms:1,undecryptable:0,limited:false});
  render(<MessageSearch room={room} serverRooms={[room]} onOpen={vi.fn()} />);
  fireEvent.change(screen.getByRole("searchbox"), {target:{value:'launch from:@alice:test has:image in:General after:2026-10-01'}});
  fireEvent.click(screen.getByRole("button", {name:/^Search$/}));
  await waitFor(() => expect(mocks.search).toHaveBeenCalled());
  expect(mocks.search.mock.calls[0][0]).toMatchObject({roomIds:[room.id],text:"launch",sender:"@alice:test",media:"image",after:expect.any(Number)});
});

it("offers users, channels and media with mouse and keyboard completion", async () => {
  render(<MessageSearch room={room} serverName="Server" serverRooms={[room,{...room,id:"!two:test",name:"Gaming"}]} members={[{id:"@alice:test",displayName:"Alice",avatarUrl:null},{id:"@bob:test",displayName:"Bob",avatarUrl:null}]} onOpen={vi.fn()} />);
  const input = screen.getByRole("searchbox"); fireEvent.focus(input);
  fireEvent.click(screen.getByRole("button",{name:/From a specific user/}));
  expect(screen.getByRole("listbox",{name:"Users"})).toBeTruthy();
  fireEvent.change(input,{target:{value:"from:bo"}});
  expect(screen.queryByRole("option",{name:/Alice/})).toBeNull();
  fireEvent.keyDown(input,{key:"Enter"});
  expect((input as HTMLInputElement).value).toBe("from:@bob:test ");
  await waitFor(() => expect(screen.getByRole("button",{name:/Sent in a specific channel/})).toBeTruthy());
  fireEvent.click(screen.getByRole("button",{name:/Sent in a specific channel/}));
  fireEvent.click(screen.getByRole("option",{name:/Gaming/}));
  expect((input as HTMLInputElement).value).toBe("from:@bob:test in:!two:test ");
  fireEvent.click(screen.getByRole("button",{name:/Includes a type of media/}));
  fireEvent.click(screen.getByRole("option",{name:/^Images\b/}));
  expect((input as HTMLInputElement).value).toBe("from:@bob:test in:!two:test has:image ");
  expect(mocks.search).not.toHaveBeenCalled();
});
it("replaces only the filter under the cursor", () => {
  render(<MessageSearch room={room} serverRooms={[room]} members={[{id:"@alice:test",displayName:"Alice",avatarUrl:null}]} onOpen={vi.fn()} />);
  const input = screen.getByRole("searchbox") as HTMLInputElement;
  fireEvent.change(input,{target:{value:"launch from:al has:image"}});
  input.setSelectionRange(14,14); fireEvent.select(input);
  fireEvent.click(screen.getByRole("option",{name:/Alice/}));
  expect(input.value).toBe("launch from:@alice:test  has:image");
});
