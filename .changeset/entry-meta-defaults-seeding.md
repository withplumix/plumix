---
"@plumix/admin": patch
---

Field `.default()` values now seed the entry editor and plain-form meta forms, matching what term, user, and settings forms already do. Opening an entry shows each unset field's default (colors, numbers, selects, JSON, times, …) instead of a blank. Foreign keys the editor doesn't own (e.g. `featuredImage`) are preserved, and defaults are display-only — the form, its `metaRef`, and the autosave diff baseline all seed from the same value, so opening an entry never autosaves a spurious change and editing a field persists only that key, not the untouched defaults.
