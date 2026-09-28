---
"plumix": patch
---

Fixes Publish in the block editor going out without an edit made in the last second: publishing now saves pending edits first and waits for any autosave in flight, so it publishes the latest content on the current token. The plain entry form no longer drops an edit made just before leaving the page, and autosaves on the same one-second debounce as the block editor.
