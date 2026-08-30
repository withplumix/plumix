---
"@plumix/admin-ui": patch
---

Fixes Cmd/Ctrl+B collapsing the sidebar while the author is typing. The shortcut now stands aside
whenever the caret is in a text field or rich-text block, so it no longer fires out from under a
keystroke that belongs to whatever has focus.

This is a deliberate divergence from the vendored shadcn component, which binds the shortcut on
`window` with no such guard. It is marked `PLUMIX DIVERGENCE` at the edit.
