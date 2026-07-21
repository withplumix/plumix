---
"@plumix/core": minor
---

Give `forTermTaxonomy` the same predicate/named-template selectors `forEntryType` already has, so a template can target term archives by term meta or an arbitrary predicate:

```ts
defineTheme({
  templates: [
    forTermTaxonomy("category").whereMeta("featured", true).template(FeaturedArchive),
    forTermTaxonomy("category").where((data) => data.term.meta.pinned === 1).template(PinnedArchive),
    forTermTaxonomy("category").named("spotlight", "Spotlight").template(Spotlight),
  ],
})
```

`whereMeta` keys and values are typed against the taxonomy's meta projection (declare `meta` in `TermTaxonomyRegistry` alongside `registerTermTaxonomy`, exported as `TermMetaOf<K>`); `where` receives the resolved `TaxonomyData`; `named` registers an author-selectable term template matched from stored term meta. Like entry predicates, a term predicate rule never matches when the resolved data is absent.
