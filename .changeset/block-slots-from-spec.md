---
"plumix": patch
---

Fixes empty or object-shaped data arrays in block attributes being treated as nested blocks. A block attribute is a slot only when the block declares it as a `type: "slot"` input, so a block storing `lines: []` gets `[]` instead of crashing the page, and a data array like `[{ id: "1", name: "Alice" }]` is no longer validated, rewritten or walked as child blocks. A block that renders children from an attribute it never declared as a slot input must now declare it. Adds `blockSlotKeys(node, spec)` to `plumix/blocks`, and `BlockTextRoster` is now `{ text, specs }`.
