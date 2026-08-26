---
"@plumix/plugin-og": minor
"@plumix/core": minor
---

Themes declare their own social cards. An `ogCards` array sits beside `templates` and takes the
same tier and matcher vocabulary — `card.forEntryType("post")`, `card.entry()`, `card.fallback()`
— resolved through core's shared rule resolver, with a registered type name narrowing the entry
data in both callbacks and a typo failing to compile. Every rule states what its card read through
a required `key`, and `cardKey.entry` / `cardKey.of` emit the URL hash and the purge tag from one
call. The card's own source and the active font set fold into the key, so a redesign or a swapped
face invalidates without a version bump. A declared card outranks the plugin's bundled default.

Core exports `loadTemplateDeps`, so a rule kind that is not a template can load the deps it
declares.
