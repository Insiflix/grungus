// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MessageComposer } from "./MessageComposer";

beforeEach(() => { URL.createObjectURL = vi.fn(() => "blob:preview"); URL.revokeObjectURL = vi.fn(); });
afterEach(cleanup);
function setup(onUpload = vi.fn().mockResolvedValue(undefined)) {
  const onSend = vi.fn().mockResolvedValue(undefined);
  const view = render(<section className="chat-workspace"><div data-testid="history">Chat history</div><MessageComposer roomName="Room" onTyping={vi.fn()} onSend={onSend} onSendAttachment={onUpload} /></section>);
  return { ...view, onSend, onUpload, input: screen.getByLabelText("Choose files to attach") };
}
describe("attachment drafts", () => {
  it("warns about the advertised limit as soon as selected files are checked and blocks the whole send", async () => {
    const onUpload = vi.fn(); const onSend = vi.fn();
    let resolveLimit!: (limit: number) => void;
    const getLimit = vi.fn(() => new Promise<number>(resolve => { resolveLimit = resolve; }));
    render(<MessageComposer roomName="Room" onTyping={vi.fn()} onSend={onSend} onSendAttachment={onUpload} getUploadLimit={getLimit} />);
    fireEvent.change(screen.getByLabelText("Choose files to attach"), { target: { files: [new File(["123456"], "large.txt"), new File(["ok"], "small.txt")] } });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "Keep this draft" } });
    const send = screen.getByRole("button", { name: "Send message" }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    resolveLimit(5);
    await screen.findByRole("alert");
    expect(screen.getByRole("alert").textContent).toContain("This server allows up to 5 B per file");
    expect(send.disabled).toBe(true);
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });
    expect(onSend).not.toHaveBeenCalled(); expect(onUpload).not.toHaveBeenCalled();
    expect((screen.getByRole("combobox") as HTMLTextAreaElement).value).toBe("Keep this draft");
    fireEvent.click(screen.getByRole("button", { name: "Remove large.txt" }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(send.disabled).toBe(false);
  });
  it("opens file selection from plus, stages image previews, and only uploads on Send", async () => {
    const { input, onUpload } = setup();
    const click = vi.spyOn(input, "click");
    fireEvent.click(screen.getByRole("button", { name: "Attach files" }));
    expect(click).toHaveBeenCalledOnce();
    const image = new File(["image"], "photo.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [image] } });
    expect(screen.getByAltText("Preview of photo.png")).toBeTruthy();
    expect(onUpload).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() => expect(onUpload).toHaveBeenCalledWith(image, expect.any(Function)));
    await waitFor(() => expect(screen.queryByAltText("Preview of photo.png")).toBeNull());
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview");
  });
  it("accepts a drop onto chat history, shows removable file cards, and prevents browser navigation", () => {
    setup();
    const history = screen.getByTestId("history");
    const dataTransfer = { types: ["Files"], files: [new File(["pdf"], "document.pdf", { type: "application/pdf" })] };
    fireEvent.dragEnter(history, { dataTransfer });
    expect(screen.getByText("Drop files to attach")).toBeTruthy();
    expect(fireEvent.drop(history, { dataTransfer })).toBe(false);
    expect(screen.queryByText("Drop files to attach")).toBeNull();
    expect(screen.getByText("document.pdf")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove document.pdf" }));
    expect(screen.queryByText("document.pdf")).toBeNull();
  });
  it("retains only failed and unsent files on retry, without duplicating a successful text or file", async () => {
    const onUpload = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("Offline")).mockResolvedValue(undefined);
    const { input, onSend } = setup(onUpload);
    fireEvent.change(input, { target: { files: [new File(["1"], "first.txt"), new File(["2"], "second.txt")] } });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "A caption" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await screen.findByRole("alert");
    expect(screen.queryByText("first.txt")).toBeNull();
    expect(screen.getByText("second.txt")).toBeTruthy();
    expect((screen.getByRole("combobox") as HTMLTextAreaElement).value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() => expect(screen.queryByText("second.txt")).toBeNull());
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onUpload).toHaveBeenCalledTimes(3);
  });
});

describe("clipboard attachments", () => {
  it("stages pasted images and files once, keeps the caption, and uploads only on Send", async () => {
    const { onSend, onUpload } = setup();
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "My caption" } });
    const image = new File(["image"], "clipboard.png", { type: "image/png" });
    const document = new File(["PDF"], "document.pdf", { type: "application/pdf" });
    const files = [image, document];
    expect(fireEvent.paste(input, { clipboardData: { files, items: files.map(file => ({ kind: "file", getAsFile: () => file })) } })).toBe(false);
    expect(screen.getByAltText("Preview of clipboard.png")).toBeTruthy();
    expect(screen.getByText("document.pdf")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /^Remove / })).toHaveLength(2);
    expect((input as HTMLTextAreaElement).value).toBe("My caption");
    expect(onUpload).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() => expect(onUpload).toHaveBeenCalledTimes(2));
    expect(onSend).toHaveBeenCalledWith("My caption");
    expect(onUpload).toHaveBeenNthCalledWith(1, image, expect.any(Function));
    expect(onUpload).toHaveBeenNthCalledWith(2, document, expect.any(Function));
  });
  it("accepts image clipboard items even if the file list is empty", () => {
    setup();
    const image = new File(["image"], "screenshot.png", { type: "image/png" });
    fireEvent.paste(screen.getByRole("combobox"), { clipboardData: { files: [], items: [{ kind: "string", getAsFile: () => null }, { kind: "file", getAsFile: () => image }] } });
    expect(screen.getByAltText("Preview of screenshot.png")).toBeTruthy();
  });
  it("preserves normal text pasting and ignores paste outside the composer", () => {
    setup();
    const clipboardData = { files: [], items: [{ kind: "string" }], getData: () => "Normal text" };
    expect(fireEvent.paste(screen.getByRole("combobox"), { clipboardData })).toBe(true);
    expect(fireEvent.paste(screen.getByTestId("history"), { clipboardData: { files: [new File(["pdf"], "outside.pdf")] } })).toBe(true);
    expect(screen.queryByText("outside.pdf")).toBeNull();
  });
  it("does not add attachments when uploads are unavailable", () => {
    render(<MessageComposer roomName="Room" onTyping={vi.fn()} onSend={vi.fn()} />);
    expect(fireEvent.paste(screen.getByRole("combobox"), { clipboardData: { files: [new File(["file"], "blocked.txt")] } })).toBe(true);
    expect(screen.queryByText("blocked.txt")).toBeNull();
  });
});
