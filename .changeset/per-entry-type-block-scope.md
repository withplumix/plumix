---
"@plumix/blocks": minor
"@plumix/admin-editor": minor
---

Add optional per-entry-type scoping for editor blocks.

Blocks registered via `ctx.registerBlock` were global — offered in every entry
type's inserter — and the only lever was `inserter: false`, which hides a block
from *every* palette. There was no way to offer a block for one entry type and
nowhere else.

A block spec can now declare an optional `entryTypes` allow-list:

```ts
defineBlock({ name: "eduscope/hero", entryTypes: ["school"], render })
```

Unset = every type (the unchanged default, so nothing changes for existing
blocks); set = the block appears only in those entry types' inserters, and is
hidden when the entry type doesn't match or is unknown. This mirrors the existing
`PatternSpec.entryTypes` scoping. It constrains only the editor's
available-blocks palette — the render registry stays global and save-time
validation is untouched, so a block already stored on an entry still renders and
still validates regardless of the type it lives on.
