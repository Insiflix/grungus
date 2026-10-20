// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, waitFor } from "@testing-library/react";

const observers: MutationObserver[] = [];
afterEach(() => { for (const observer of observers.splice(0)) observer.disconnect(); document.body.innerHTML = ""; vi.restoreAllMocks(); });
function fixture() {
  const postMessage = vi.fn();
  class Observer extends MutationObserver { constructor(callback: MutationCallback) { super(callback); observers.push(this); } }
  runInNewContext(readFileSync("scripts/element-call-fullscreen.js", "utf8"), { document, Element, MutationObserver: Observer, location: { hash: "#?widgetId=test&parentUrl=http%3A%2F%2Flocalhost%2F" }, URL, URLSearchParams, parent: { postMessage } });
  const tile = document.createElement("div");
  tile.dataset.testid = "videoTile"; tile.dataset.videoEnabled = "true";
  const video = document.createElement("video");
  video.requestFullscreen = vi.fn().mockResolvedValue(undefined);
  tile.append(video); document.body.append(tile);
  return { tile, video, postMessage };
}
describe("embedded video fullscreen", () => {
  it("adds one fullscreen button to newly arriving tiles and expands the chosen video", async () => {
    const f = fixture();
    await waitFor(() => expect(f.tile.querySelector(".grungus-tile-fullscreen")).not.toBeNull());
    fireEvent.click(f.tile.querySelector("button")!);
    expect(f.video.requestFullscreen).toHaveBeenCalledTimes(1);
    const otherVideo = document.createElement("video"); otherVideo.requestFullscreen = vi.fn();
    const otherTile = document.createElement("div"); otherTile.dataset.testid = "videoTile"; otherTile.append(otherVideo); document.body.append(otherTile);
    await waitFor(() => expect(otherTile.querySelector("button")).not.toBeNull());
    fireEvent.doubleClick(otherVideo);
    expect(otherVideo.requestFullscreen).toHaveBeenCalledTimes(1);
    expect(f.video.requestFullscreen).toHaveBeenCalledTimes(1);
    expect(f.tile.querySelectorAll(".grungus-tile-fullscreen")).toHaveLength(1);
  });
  it("hides fullscreen when a camera turns off and restores it when video returns", async () => {
    const f = fixture();
    await waitFor(() => expect(f.tile.querySelector("button")).not.toBeNull());
    f.tile.dataset.videoEnabled = "false";
    await waitFor(() => expect(f.tile.querySelector("button")!.hidden).toBe(true));
    fireEvent.doubleClick(f.video);
    expect(f.video.requestFullscreen).not.toHaveBeenCalled();
    f.tile.dataset.videoEnabled = "true";
    await waitFor(() => expect(f.tile.querySelector("button")!.hidden).toBe(false));
  });
  it("reports fullscreen failures to the authenticated host", async () => {
    const f = fixture();
    vi.mocked(f.video.requestFullscreen).mockRejectedValue(new Error("Denied"));
    await waitFor(() => expect(f.tile.querySelector("button")).not.toBeNull());
    fireEvent.click(f.tile.querySelector("button")!);
    await waitFor(() => expect(f.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "grungus:media-status", widgetId: "test", fullscreenError: expect.any(String) }), "http://localhost"));
  });
});
