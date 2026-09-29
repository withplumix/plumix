---
"plumix": patch
---

Adds variants to the `plumix/admin/ui` primitives: `PopoverContent` and `DialogContent` `variant="flush"` (no padding, for content that brings its own, like a command list), `Empty` `variant="outline"`, `Label` `variant="choice"` and `variant="caption"` (also on `FieldLabel`), `Textarea` `variant="code"`, `Input` `variant="generated"` (a read-only token or link to copy) and `TableCell` `variant="muted"`. The admin now draws these treatments through the variants instead of one-off classes, so a few controls settle onto the primitives' own look: the user menu's avatar takes the default fallback colours, search boxes use `InputGroup`, and the editor's title input drops its medium weight.
