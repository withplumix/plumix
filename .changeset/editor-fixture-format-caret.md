---
"plumix": patch
---

Fixes the `editor` fixture's `richText(block).format` sometimes leaving a heading unchanged when the text ended in a heading, list or quote, because the caret landed in the trailing empty paragraph.
