// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { WorkspaceRail } from "./WorkspaceRail";
import type { MatrixRoom } from "../../../domain/matrix/MatrixTypes";
afterEach(() => { cleanup(); localStorage.clear(); });
it("reorders servers with drag and keyboard and restores the order on remount", () => {
  const props = { spaces: ["Alpha", "Beta", "Gamma"].map(name => ({ id: name, name })) as MatrixRoom[], selectedSpaceId: null, onSelectSpace: () => {}, onCreateServer: () => {} };
  const view = render(<WorkspaceRail {...props} />);
  const names = () => [...document.querySelectorAll(".rail-servers button")].map(button => button.getAttribute("aria-label"));
  fireEvent.keyDown(screen.getByRole("button", { name: "Gamma" }), { altKey: true, key: "ArrowUp" });
  expect(names()).toEqual(["Alpha", "Gamma", "Beta"]);
  const dataTransfer = { setData() {}, effectAllowed: "", dropEffect: "" };
  fireEvent.dragStart(screen.getByRole("button", { name: "Beta" }), { dataTransfer });
  fireEvent.drop(screen.getByRole("button", { name: "Alpha" }), { dataTransfer });
  expect(names()).toEqual(["Beta", "Alpha", "Gamma"]);
  view.unmount(); render(<WorkspaceRail {...props} />);
  expect(names()).toEqual(["Beta", "Alpha", "Gamma"]);
});
