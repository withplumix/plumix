---
"@plumix/core": minor
"@plumix/admin": patch
"@plumix/admin-ui": patch
---

Polish the repeater row editor and fix a data-loss bug in its summary rail.

- **New `repeater(...).dialogSize("sm" | "md" | "lg")`** sets the row-editor
  dialog width (`sm:max-w-lg` / `sm:max-w-2xl` / `sm:max-w-4xl`; default `md`).
  Widen it for dense, multi-column rows. Threaded core builder → manifest →
  admin like the existing `.layout()` / `.collapsed()` hints.
- **Data loss on add / remove / reorder after editing a row is fixed.** The
  summary rail read the parent Controller's snapshot, which doesn't re-render
  when a subfield is edited inside the row dialog; the next structural change
  then committed an array missing the just-edited row's values. It now reads
  the live array via `useWatch`.
- **Row-editor dialog no longer breaks layout when a field shows a validation
  message** — the grid stretched every sibling cell to the errored field's
  height and vertically centered their controls out of line; cells now
  top-align.
- **Toggle fields render label-above** like every other grid field, so a
  toggle sharing a row with text / number inputs aligns on the input midline
  instead of floating at the siblings' label height.
- The summary row's **Edit control is now an icon-only button** (was a
  text button that turned red on error); error state is conveyed solely by the
  warning indicator, and destructive styling is reserved for the remove button.
  Its accessible name is row-numbered ("Edit row 3") so a screen reader can
  tell the rows apart.
