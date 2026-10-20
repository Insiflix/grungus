Use the shared themed controls for app UI:

- `ThemedSelect` for dropdowns. It accepts option children and supports keyboard navigation and typeahead.
- `ThemedAutocomplete` for a text field with suggestions that also accepts arbitrary values.
- `ThemedDatePicker` for date entry and calendars. Keep dates in `YYYY-MM-DD` format.
- `data-tooltip` for hover and keyboard help. `DesktopFrame` mounts `ThemedTooltips` once.
- `ThemedPopover` for anchored custom surfaces, including inside modal dialogs. It uses the top layer without rendering any browser-provided menu.

Use app theme tokens for all controls and overlays. Do not introduce native HTML selects, datalists, date/time picker inputs, or `title` tooltips. An iframe's `title` is its accessible name and should stay intact. Settings section `title` props are headings, not tooltips.
