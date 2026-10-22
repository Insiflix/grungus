// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { emptyIdentityState } from "../../../infrastructure/matrix/MatrixIdentityManager";
import type { MatrixIdentityState } from "../../../domain/matrix/MatrixTypes";
import { IdentityDialog } from "./IdentityDialog";

const state = vi.hoisted(() => ({ identity: null as MatrixIdentityState | null }));
vi.mock("../../app/providers/MatrixProvider", () => ({ useMatrixRuntime: () => runtime }));
vi.mock("../../hooks/matrix/useMatrixSnapshot", () => ({ useMatrixSnapshot: () => ({ identity: state.identity, session: { userId: "@me:test", deviceId: "DEVICE" } }) }));
const runtime = {
  refreshIdentity: vi.fn(async () => undefined), clearIdentitySecrets: vi.fn(),
  acceptIdentityVerification: vi.fn(async () => undefined), startIdentityComparison: vi.fn(async () => undefined),
  confirmIdentityComparison: vi.fn(async (_matches: boolean) => undefined), cancelIdentityVerification: vi.fn(async () => undefined),
  requestUserVerification: vi.fn(async (_userId: string) => undefined),
};
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute("open", ""); });
  HTMLDialogElement.prototype.close = vi.fn();
  state.identity = { ...emptyIdentityState(), available: true, verification: { userId: "@alice:test", incoming: true, phase: "requested" } };
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it("handles incoming peer requests and shows comparison controls without account recovery", async () => {
  const view = render(<IdentityDialog onClose={vi.fn()} />);
  expect(screen.getByRole("heading", { name: "Verify user" })).toBeTruthy();
  expect(screen.queryByText("Verify with a recovery key")).toBeNull();
  expect(screen.queryByText("Replace identity")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Accept request" }));
  await waitFor(() => expect(runtime.acceptIdentityVerification).toHaveBeenCalledOnce());
  state.identity!.verification = { ...state.identity!.verification!, phase: "ready" };
  view.rerender(<IdentityDialog onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Start emoji comparison" }));
  await waitFor(() => expect(runtime.startIdentityComparison).toHaveBeenCalledOnce());
  state.identity!.verification = { ...state.identity!.verification!, phase: "started", emoji: [["🐶", "Dog"], ["🌳", "Tree"]] };
  view.rerender(<IdentityDialog onClose={vi.fn()} />);
  expect(screen.getByText("Dog")).toBeTruthy();
  expect(runtime.confirmIdentityComparison).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Yes, they match" }));
  await waitFor(() => expect(runtime.confirmIdentityComparison).toHaveBeenCalledExactlyOnceWith(true));
  state.identity!.verification = { ...state.identity!.verification!, phase: "done", emoji: undefined };
  view.rerender(<IdentityDialog onClose={vi.fn()} />);
  expect(screen.getByText("Verification completed successfully.")).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Verify user" })).toBeTruthy();
});
it("allows a cancelled outgoing peer request to be retried", async () => {
  state.identity!.verification = { userId: "@alice:test", incoming: false, phase: "cancelled" };
  render(<IdentityDialog userVerification onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Request verification" }));
  await waitFor(() => expect(runtime.requestUserVerification).toHaveBeenCalledExactlyOnceWith("@alice:test"));
});
