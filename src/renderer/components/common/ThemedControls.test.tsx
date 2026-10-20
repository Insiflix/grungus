// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { ThemedSelect } from "./ThemedSelect";
import { ThemedDatePicker, parseDate } from "./ThemedDatePicker";
import { ThemedAutocomplete } from "./ThemedAutocomplete";
import { ThemedTooltips } from "./ThemedTooltips";

afterEach(() => {cleanup();vi.useRealTimers();});
it("chooses options by keyboard without submitting the form and dismisses on Escape/outside click", () => {
  const change = vi.fn(), submit = vi.fn();
  render(<form onSubmit={submit}><label>Device<ThemedSelect value="a" onChange={change}><option value="a">Default</option><option value="b" disabled>Unavailable</option><option value="c">Headphones</option></ThemedSelect></label><button>Outside</button></form>);
  const field = screen.getByRole("combobox");
  fireEvent.keyDown(field,{key:"ArrowDown"});
  expect(screen.getByRole("listbox")).toBeTruthy();
  fireEvent.keyDown(field,{key:"Enter"});
  expect(change).toHaveBeenCalledWith({target:{value:"c"},currentTarget:{value:"c"}});
  expect(submit).not.toHaveBeenCalled();
  fireEvent.click(field);fireEvent.keyDown(field,{key:"Escape"});
  expect(screen.queryByRole("listbox")).toBeNull();
  expect(document.activeElement).toBe(field);
  fireEvent.click(field);fireEvent.pointerDown(screen.getByText("Outside"));
  expect(screen.queryByRole("listbox")).toBeNull();
  expect(document.querySelector("select")).toBeNull();
});
it("supports dropdown typeahead and keeps selection unchanged until committed", () => {
  const change = vi.fn();
  render(<ThemedSelect aria-label="Media" value="image" onChange={change}><option value="image">Images</option><option value="video">Videos</option></ThemedSelect>);
  const field = screen.getByRole("combobox");
  fireEvent.keyDown(field,{key:"v"});expect(change).not.toHaveBeenCalled();
  fireEvent.keyDown(field,{key:"Enter"});expect(change.mock.calls[0][0].target.value).toBe("video");
});
it("picks leap days using an app calendar and allows clearing or manual entry", () => {
  function Fixture() {const [value,setValue] = useState("2028-02-28");return <ThemedDatePicker aria-label="From date" value={value} onChange={setValue} />;}
  render(<Fixture />);
  expect(parseDate("2027-02-29")).toBeNull();
  fireEvent.click(screen.getByRole("button",{name:"Choose from date"}));
  const day = screen.getAllByRole("gridcell").find(node => node.textContent === "29")!;
  fireEvent.click(day);
  expect((screen.getByLabelText("From date") as HTMLInputElement).value).toBe("2028-02-29");
  fireEvent.click(screen.getByRole("button",{name:"Choose from date"}));
  fireEvent.click(screen.getByRole("button",{name:"Clear"}));
  expect((screen.getByLabelText("From date") as HTMLInputElement).value).toBe("");
  fireEvent.change(screen.getByLabelText("From date"),{target:{value:"2026-10-20"}});
  expect((screen.getByLabelText("From date") as HTMLInputElement).value).toBe("2026-10-20");
  expect(document.querySelector('input[type="date"]')).toBeNull();
});
it("filters custom autocomplete suggestions while allowing arbitrary IDs", () => {
  function Fixture() {const [value,setValue] = useState("");return <ThemedAutocomplete aria-label="Member" value={value} onChange={setValue} options={[{value:"@alice:test",label:"Alice"},{value:"@bob:test",label:"Bob"}]} />;}
  render(<Fixture />);const field = screen.getByRole("combobox");
  fireEvent.change(field,{target:{value:"ali"}});
  expect(screen.getAllByRole("option")).toHaveLength(1);
  fireEvent.keyDown(field,{key:"Enter"});expect((field as HTMLInputElement).value).toBe("@alice:test");
  fireEvent.change(field,{target:{value:"@outside:test"}});
  expect((field as HTMLInputElement).value).toBe("@outside:test");
  expect(document.querySelector("datalist")).toBeNull();
});
it("shows a themed tooltip on hover or focus and dismisses it on Escape", () => {
  vi.useFakeTimers();
  render(<><ThemedTooltips /><button data-tooltip="Voice settings">Settings</button></>);
  const button = screen.getByRole("button");
  fireEvent.pointerOver(button);act(() => vi.advanceTimersByTime(450));
  expect(screen.getByRole("tooltip").textContent).toBe("Voice settings");
  expect(button.getAttribute("aria-describedby")).toBe(screen.getByRole("tooltip").id);
  fireEvent.keyDown(button,{key:"Escape"});expect(screen.queryByRole("tooltip")).toBeNull();
  expect(button.hasAttribute("aria-describedby")).toBe(false);
  fireEvent.focusIn(button);act(() => vi.advanceTimersByTime(1));expect(screen.getByRole("tooltip")).toBeTruthy();
  expect(button.hasAttribute("title")).toBe(false);
});
