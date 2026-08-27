---
"@plumix/core": minor
---

The tier and matcher vocabulary a theme selects with is now defined once. `forEntryType`,
`forTermTaxonomy`, `forAuthor`, `forDate` and `forArchiveType` — their `.slug()` / `.id()` /
`.whereMeta()` / `.where()` chains, the `archive` sub-selector and the matchers they mint — are
built from `entryTypeTargets`, `termTaxonomyTargets`, `authorTargets`, `dateTargets` and
`archiveTypeTargets`, which core now exports. A plugin declaring its own rule kind against the
node hierarchy composes its selectors out of those rather than restating core's matchers, the way
it already resolves them through `resolveRule`. No change to what the template builders accept or
produce.
