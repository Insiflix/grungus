// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MessageRow } from "./MessageRow";
import type { MatrixMessage } from "../../../domain/matrix/MatrixTypes";
const message: MatrixMessage = { id: "$failed", roomId: "!room", sender: { id: "@me:test", displayName: "Me", avatarUrl: null }, timestamp: 1, type: "text", body: "Pending", edited: false, replyTo: null, reactions: [], sendState: "failed", isOwn: true, isRedacted: false };
afterEach(cleanup);
it("offers retry and cancel on failed own messages and reports a failed retry", async () => {
  const retry = vi.fn().mockRejectedValue(new Error("Still offline")); const cancel = vi.fn().mockResolvedValue(undefined);
  render(<MessageRow message={message} grouped={false} onReact={vi.fn()} onRetry={retry} onCancelSend={cancel} />);
  fireEvent.click(screen.getByRole("button", { name: "Resend message" }));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Still offline"));
  fireEvent.click(screen.getByRole("button", { name: "Cancel failed send" }));
  await waitFor(() => expect(cancel).toHaveBeenCalledTimes(1)); expect(retry).toHaveBeenCalledTimes(1);
});
it("never offers recovery controls on received messages", () => {
  render(<MessageRow message={{ ...message, isOwn: false }} grouped={false} onReact={vi.fn()} onRetry={vi.fn()} onCancelSend={vi.fn()} />);
  expect(screen.queryByRole("button", { name: "Resend message" })).toBeNull();
});
it("offers a decryption retry for a received encrypted message without resending it", async () => {
  const retry = vi.fn().mockRejectedValue(new Error("The sender has not shared the encryption key."));
  render(<MessageRow message={{ ...message, type: "encrypted", canRetryDecryption: true, isOwn: false, sendState: "sent" }} grouped={false} onReact={vi.fn()} onRetry={retry} />);
  fireEvent.click(screen.getByRole("button", { name: "Retry decryption" }));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("has not shared"));
  expect(retry).toHaveBeenCalledOnce();
  expect(screen.queryByRole("button", { name: "Resend message" })).toBeNull();
});
it("shows pre-join history as a compact notice without a retry action", () => {
  render(<MessageRow message={{ ...message, type: "encrypted", body: "Message sent before you joined.", canRetryDecryption: false, isOwn: false, sendState: "sent" }} grouped={false} onReact={vi.fn()} onRetry={vi.fn()} />);
  expect(screen.getAllByText("Message sent before you joined.")).toHaveLength(1);
  expect(screen.queryByRole("button", { name: "Retry decryption" })).toBeNull();
});
it("keeps a repeated decryption failure in the message column and displays it only once", async () => {
  const body = "The sender has not shared the encryption key.";
  const retry = vi.fn().mockRejectedValue(new Error(body));
  const view = render(<MessageRow message={{ ...message, type: "encrypted", body, canRetryDecryption: true, isOwn: false, sendState: "sent" }} grouped={false} onReact={vi.fn()} onRetry={retry} />);
  fireEvent.click(screen.getByRole("button", { name: "Retry decryption" }));
  const alert = await screen.findByRole("alert");
  expect(alert.closest(".message-row__content")).toBeTruthy();
  expect(screen.getAllByText(body)).toHaveLength(1);
  expect(view.container.querySelector(".message-special")).toBeNull();
});
