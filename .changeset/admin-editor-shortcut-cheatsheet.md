---
"@plumix/admin-editor": minor
---

Adds a keyboard-shortcut cheatsheet to the editor, opened with `?`, Cmd/Ctrl+/, or the new keyboard
button in the canvas toolbar. It lists every binding the editor claims — selection, clipboard,
canvas, inline formatting, history — with the modifier glyphs the viewer's platform actually uses
(⌘/⇧ on Apple, Ctrl/Shift elsewhere). `?` opens it with focus on the shell or inside the canvas
iframe, and stands aside while the author is typing into a field or a rich-text block.

The list is not a hand-written copy of the handlers. Bindings are declared once in a shortcut
roster, and the key handlers — clipboard, undo/redo, the canvas view keys, the Layers delete, the
drag cancel — now match against that roster instead of spelling their own key tests. Inline
formatting comes from the marks' own `keyboardShortcut` metadata. A binding without a cheatsheet
description is a type error, so the list can't quietly fall behind what the editor does. Three
entries are described but not owned: the two pointer gestures, which no key matcher can fire, and
Cmd/Ctrl+B for the panels, which belongs to the sidebar.

Declaring the bindings in one place surfaced two chords that fired more than the cheatsheet would
have printed, and both are now pinned to what they say. Cmd+Shift+X toggled x-ray as well as
striking text through, and Cmd+Shift+C/X/V ran the block clipboard as if Shift weren't held — a
modifier the editor doesn't name in a binding no longer silently falls through to it.
