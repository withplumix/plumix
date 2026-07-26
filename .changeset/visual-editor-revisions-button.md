---
"@plumix/admin-editor": patch
"@plumix/admin-ui": patch
"@plumix/admin": patch
---

Restore the browse-revision-history button in the visual editor.

The Puck-removal refactor (#1143) left the bespoke `PlumixEditor` header with no
slot for the revision-history affordance, so `edit.tsx` stopped wiring it for the
visual branch — revision history became reachable only by hand-crafting a
`?revision=<id>` URL. `PlumixEditor` (and its header) now take an optional
`revisionsTrigger` slot, rendered as a history icon just after undo/redo, and the
visual editor route wires `useRevisionsTrigger` into it — mirroring the plain-form
editor (which keeps its labelled text button via the sheet's `triggerVariant`).
The sheet's orpc calls stay in the app; the package only exposes the slot.
