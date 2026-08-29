---
"@plumix/core": minor
"plumix": minor
---

Fixes `.whereMeta()` on the template and rule-kind selectors, which typed its value against the
stored meta shape and then compared it against the decoded one — so a narrowing on a
`.returns("date")` field or a reference type-checked and never fired.

`ResolvedEntry` and `ResolvedTerm` now carry `storedMeta` beside `meta`: the meta JSON as the row
holds it, next to the decoded and reference-hydrated bag a template reads. `metaEquals` and
`termMetaEquals` — and so `.whereMeta()` and `.named()`, which are built from them — compare
against `storedMeta`. `.whereMeta("filedOn", "2026-01-01")` now matches the stored ISO string a
`.returns("date")` field reads back as a `Date`, and `.whereMeta("subject", "42")` matches the
stored id a reference reads back as a summary object.

The types are unchanged: `StoredMetaOf<K>` / `StoredTermMetaOf<K>` were always what `whereMeta`
addressed, and `===` has a primitive to land on there — a `Date` and a hydrated summary have no
literal a caller could write down. A theme that worked around the old behaviour with `.where()`
reading `data.entry.meta` still does; a hand-built `ResolvedEntry` (a preview fixture, a test
double) has to add `storedMeta`.
