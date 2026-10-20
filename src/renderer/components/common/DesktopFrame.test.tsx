// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DesktopFrame } from "./DesktopFrame";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("custom titlebar", () => {
  it("uses the desktop controls and updates restore state after native maximize events", async () => {
    let changed!: (state: { maximized: boolean }) => void;
    const unsubscribe = vi.fn();
    const controls = { getState: vi.fn().mockResolvedValue({ maximized: false }), minimize: vi.fn().mockResolvedValue(undefined), toggleMaximize: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined), onStateChange: (listener: typeof changed) => { changed = listener; return unsubscribe; } };
    vi.stubGlobal("desktop", { windowControls: controls });
    const view = render(<DesktopFrame>App content</DesktopFrame>);
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "Minimize window" }));
    fireEvent.click(screen.getByRole("button", { name: "Maximize window" }));
    act(() => changed({ maximized: true }));
    expect(screen.getByRole("button", { name: "Restore window" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close window" }));
    expect(controls.minimize).toHaveBeenCalledOnce(); expect(controls.toggleMaximize).toHaveBeenCalledOnce(); expect(controls.close).toHaveBeenCalledOnce();
    view.unmount(); expect(unsubscribe).toHaveBeenCalledOnce();
  });
  it("keeps browser content usable without desktop chrome", () => {
    vi.stubGlobal("desktop", undefined);
    render(<DesktopFrame>App content</DesktopFrame>);
    expect(screen.getByText("App content")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Close window" })).toBeNull();
  });
});
