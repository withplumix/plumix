---
"@plumix/core": minor
---

Fixes publishing an entry rewriting meta fields the author never edited. An autosave now stores the keys the author touched rather than a copy of the whole live row, so promoting it re-runs the field pipeline over those keys and no others. A value left by an import, a direct write, or a row persisted before a plugin tightened a field is promoted exactly as stored — previously an unrelated edit dragged it back through the write path's input decoder, turning a stored `1` under a `type: "boolean"` field into `true` after every read surface, including the admin toggle, had shown it as unset.

The publish gate is unchanged in reach: required fields, bounds, formats and row counts are still enforced across the whole resulting bag, so a draft-lenient violation still blocks the publish whether or not the author touched that key. Clearing a field in a draft still clears it on publish, and re-sanitizing a key the author did draft still happens.

`getAutosave` still returns a whole draft row, with the edits laid over the live entry, and now takes the live row as an optional third argument to save a lookup where the caller already has it — pass the stored row, not one whose meta has been resolved. It now returns `undefined` for an autosave whose entry no longer exists, where it used to return the orphan: there is no row to lay the edits over, so what came back was a draft only in name.

Autosave rows written before this release are read as "every key touched", which is the previous behaviour, and clear as those drafts are published or discarded.
