---
"plumix": patch
---

Fixes Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z, Cmd/Ctrl+B and Delete/Backspace doing nothing in the editor after clicking a block. The canvas now forwards them to the editor like its other shortcuts, so they undo, redo, toggle the panels and delete the selected blocks whether focus is in the canvas or around it.
