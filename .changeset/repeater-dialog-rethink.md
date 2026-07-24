---
"@plumix/admin": minor
"@plumix/core": minor
---

Rework the metabox repeater UI. Rows previously crammed every field inline into
the narrow document rail, ran tall, and dropped each subfield's `.span()`. Now
each row is a compact, scannable summary (a label from the `.collapsed()`
subfield or the first non-empty value) with an Edit button; editing opens a
roomy dialog that lays the row's fields out on the same 12-column grid the box
uses, honoring each subfield's `.span()`. Adding a row opens its editor
directly, and a row whose fields hold a validation error is flagged so it's
discoverable while the dialog is closed. Groups likewise lay their members out
on a span-aware grid.

Repeater and group subfields now carry their `span` on the manifest wire
(previously dropped as "children are full-width", since the old inline rail
couldn't honor it) so the composite editors can lay them out.
