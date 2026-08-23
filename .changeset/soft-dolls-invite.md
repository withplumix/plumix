---
"plumix": minor
---

Adds `coreShortcodes`, `ShortcodeSpec` and `PlumixPrefetch` to `plumix/blocks`. All three were already public on `@plumix/blocks` but had never been forwarded to the façade, so reaching them meant importing the internal package by name. `coreShortcodes` is the shortcode analogue of `coreBlocks` and `coreMarks`, and `ShortcodeSpec` and `PlumixPrefetch` complete pairs whose siblings — `BlockSpec`, `MarkSpec`, `PlumixStrategy` — the façade already forwards.
