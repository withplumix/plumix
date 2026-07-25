---
"@plumix/admin": patch
---

Polish the repeater summary rail and checkbox layout.

- A repeater's summary row now resolves a `select` / `radio` sub-field's
  stored value to its option label — a collapsed row reads "Card", not the
  raw stored `card`.
- The summary text truncates with an ellipsis instead of growing the row and
  blowing out the meta panel's width when a heading or option label is long
  (the field's grid cell defaults to `min-width: auto`, so the container now
  sets `min-w-0`).
- Checkbox fields render label-above like the toggle and the other grid
  fields, so a checkbox sharing a row with text / number inputs lines up on
  the input midline instead of floating at the neighbours' label height.
