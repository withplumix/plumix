---
"@plumix/admin-editor": patch
---

Seeds a new entry from a starter pattern as an independent copy, whatever the pattern's `insert`
mode says.

The starter picker shared the inserter's `expandPattern`, which honours `insert: "reference"` by
splicing a single `core/pattern-ref`. A starter-eligible pattern that also declared reference-mode
therefore left every entry created from it a live pointer at the pattern: editing the pattern
rewrote published entries, and the author had nothing to edit on the canvas. The starter path now
expands the body directly with fresh ids; the inserter keeps honouring `reference`, which is where
that mode is meant to apply.
