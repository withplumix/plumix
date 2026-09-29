---
"plumix": minor
---

Adds variants to the `plumix/admin/ui` primitives: `Field` `size="sm"` (a compact field whose label and title shrink), `Button` `variant="trigger"` (a full-width, select-like picker that mutes itself while it carries `data-placeholder`), `variant="destructive-ghost"` and `variant="destructive-row"`, `Input` `variant="inline"`, `Card` `variant="interactive"` and `variant="destructive"`, `DialogContent` `size` (`sm`, `md`, `lg`) and `FormItem` `span` for a 12-column grid. `TableHead` and `TableCell` end-align under `data-align="end"`. Removes `destructiveGhostClassName` and `destructiveRowClassName`; use `<Button variant="destructive-ghost">` and `<Button variant="destructive-row">` instead.
