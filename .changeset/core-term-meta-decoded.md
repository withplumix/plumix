---
"@plumix/core": minor
"plumix": minor
---

Fixes `ResolvedTerm.meta` on the public render path, which handed a template the raw meta JSON
column while `ResolvedTermFor<K>` typed it as the decoded read shape `TermMetaOf<K>` describes. A
`.returns("date")` term field typed as `Date` and arrived as the stored ISO string; a reference
field typed as its hydrated summary and arrived as the stored id.

Term meta now gets the same treatment entry meta does. `buildResolvedEntries` decodes and
reference-hydrates the terms it attaches to each entry — batched, so the terms across a whole
archive cost one in-query per `(kind, scope)` group rather than one per term — and a term archive
resolved through `termData` does the same. `storedMeta` still carries the JSON column untouched, so `.whereMeta()`
and `termMetaEquals` keep matching stored values; `meta` and `storedMeta` now differ on a term
exactly as they already did on an entry.

The types are unchanged — `ResolvedTerm.meta` was already `ResolvedMeta` and `ResolvedTermFor<K>`
already folded to `TermMetaOf<K>`; only the runtime was behind. A theme that read `data.term.meta`
expecting the raw column should read `data.term.storedMeta` instead.

Note that `.default()` is unaffected on terms as on entries: it prefills the admin form and
nothing applies it on read, so a defaulted key absent from storage still reads back `undefined`.
