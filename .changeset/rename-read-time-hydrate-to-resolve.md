---
"@plumix/core": minor
---

Rename the read-time `hydrate*` reference/meta family to `resolve*`, freeing the
word "hydration" for its one canonical sense: island hydration (attaching client
React to server markup).

"Hydration" meant two unrelated things in the code. Island hydration is the
load-bearing sense. The read-time data-enrichment family — resolving referenced
entities and meta bags into rows during a read — is resolution, not hydration.
Reserving "hydration" for islands and renaming the enrichment family removes the
collision (`CONTEXT.md` glossary updated to match).

Renamed: `hydrateReferences` → `resolveReferences` (the public, theme-facing
id-set resolver), plus the core-internal `hydrateMetaBags`/`hydrateMetaReferences`
pipeline and the per-entity `hydrateEntryMeta`/`hydrateEntriesMeta`/
`hydrateTermMeta`/`hydrateUserMeta` read helpers. The `LookupAdapter.hydrate`
contract method and the reference-shape types are unchanged — the adapter still
`hydrate`s a payload; the pipeline that calls it now `resolve`s references.

Migration: if you imported `hydrateReferences` from `plumix` / `@plumix/core` to
resolve an id-only reference field in a theme, import `resolveReferences` instead
— same signature and behavior. Custom `LookupAdapter` implementations need no
change.
