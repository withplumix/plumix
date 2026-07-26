---
"@plumix/admin-editor": patch
"@plumix/admin-ui": patch
"@plumix/admin": patch
---

Reintroduce the starter picker for empty entries.

The Puck-removal refactor (#1143) dropped the "Pick a starter…" onboarding shown
when authoring a blank entry, so new entries opened onto an empty canvas with no
offered starting points — even though the pattern data layer still marked
starter-eligible patterns (`target: "post-content"`, optional `entryTypes`,
`priority`). The bespoke editor now surfaces them again:

- `PlumixEditor` takes an `entryType` and, for a blank entry, opens a modal of
  the eligible starter patterns (ordered by priority) plus a "Start from blank"
  escape. Choosing one seeds the canvas with the pattern's blocks (fresh ids, a
  single undoable step); the editor stays empty on "Start from blank".
- A toolbar "Pick a starter…" button re-summons the picker while the canvas is
  still empty, so a dismissal isn't final.

Starter open state lives in the editor store; the read-only revision preview
omits the picker.
