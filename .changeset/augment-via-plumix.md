---
"@plumix/core": patch
---

Standardize type augmentation on the single public `plumix` specifier.

The augmentable registry docstrings (`EntryTypeRegistry`, `ArchiveTypeRegistry`,
`TermTaxonomyRegistry`, `TemplateDepRegistry`, `ReferenceHydrationShapes`,
`BlockTypeRegistry`, `PatternCategoryRegistry`) told consumers to
`declare module "@plumix/core"`. That specifier is an internal package consumers
don't depend on, so the augmentation silently no-op'd and `forEntryType("…")`
still errored — the bug reported in #1691.

Every registry is now augmented through one specifier, `declare module "plumix"`:

```ts
declare module "plumix" {
  interface EntryTypeRegistry {
    insight: { entry: ResolvedEntry };
  }
}
```

`plumix` re-exports the block/pattern registries (`BlockTypeRegistry`,
`PatternCategoryRegistry`, type-only) so the whole augment surface lives behind
one module. Using one specifier matters: augmenting the same interface through
two of them (e.g. `plumix` and `plumix/plugin`) fractures declaration merging —
each view drops the other's keys. A `no-restricted-syntax` lint rule now forbids
augmenting `@plumix/*` packages or `plumix/*` subpaths, steering everything to
`plumix`. See `docs/type-augmentation.md`.
