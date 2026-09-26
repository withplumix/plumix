---
"@plumix/plugin-media": patch
"plumix": patch
---

Fixes the media lookup browse path (`lookup.list({ kind: "media", query })`) disagreeing with `media.list`. It now runs the same query, so for the same search it returns the same assets in the same order (most recently updated first). It also matches alt text as well as the title, and treats a `%` or `_` in the query as a literal character, not a wildcard.

`media(...).accept()` now throws a `FieldConfigError` (`accept_out_of_bounds`) at build time for a value `media.list` would reject: a type longer than 64 characters, or a list of more than 32 types. Previously such a field registered without error and every list call from its picker failed validation.
