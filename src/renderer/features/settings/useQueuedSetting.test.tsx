// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useQueuedSetting } from "./useQueuedSetting";

afterEach(cleanup);
function Control({ save }: { save: (value: boolean) => Promise<void> }) {
  const [confirmed, setConfirmed] = useState(false);
  const setting = useQueuedSetting(confirmed, async (value) => { await save(value); setConfirmed(value); });
  return <><input aria-label="Example setting" type="checkbox" checked={setting.value} onChange={(event) => setting.change(event.target.checked)} />{setting.error && <p role="alert">{setting.error}</p>}</>;
}
describe("non-blocking setting saves", () => {
  it("updates immediately and serializes rapid changes without disabling the switch", async () => {
    const user = userEvent.setup();
    let finishFirst!: () => void;
    const save = vi.fn().mockImplementationOnce(() => new Promise<void>((resolve) => { finishFirst = resolve; })).mockResolvedValue(undefined);
    render(<Control save={save} />);
    const control = screen.getByRole("checkbox");
    await user.click(control);
    expect(control).toHaveProperty("checked", true);
    expect(control).toHaveProperty("disabled", false);
    await user.click(control);
    expect(control).toHaveProperty("checked", false);
    expect(save).toHaveBeenCalledTimes(1);
    await act(async () => finishFirst());
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save.mock.calls).toEqual([[true], [false]]);
    expect(screen.getByRole("checkbox")).toBe(control);
    expect(control).toHaveProperty("checked", false);
  });
  it("restores the confirmed value and reports an error when saving fails", async () => {
    const user = userEvent.setup();
    const save = vi.fn().mockRejectedValue(new Error("Offline"));
    render(<Control save={save} />);
    await user.click(screen.getByRole("checkbox"));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Offline");
    expect(screen.getByRole("checkbox")).toHaveProperty("checked", false);
    expect(screen.getByRole("checkbox")).toHaveProperty("disabled", false);
  });
});
