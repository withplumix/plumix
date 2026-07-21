---
"@plumix/core": minor
"create-plumix-app": patch
---

Redesign the theme template system around a typed, array-based `templates` model with router-style resolution.

A theme's `templates` is now an **array of rules** built with typed helpers instead of a slug-keyed object. Generic tiers are direct builders — `fallback`, `entry`, `archive`, `taxonomy`, `frontPage`, `postsPage`, `search`, `notFound`, `serverError` — and targeted rules are built with `forEntryType(name)` / `forTaxonomy(name)`, which autocomplete against the registered types, reject typos at compile time, and type `data.entry` / `data.term`:

```ts
defineTheme({
  templates: [
    fallback(HomeAndArchives),
    entry(Post),
    forEntryType("page").template(Page),
    forEntryType("post").whereMeta("featured", true).template(FeaturedPost),
    forTaxonomy("category").slug("news").template(NewsArchive),
    notFound(NotFound),
  ],
})
```

Resolution follows a Laravel-router model: targeted rules in declaration order (first match wins), then the generic tier for the resolved node, then `fallback`. When nothing matches and there is no `fallback`, the request renders the 404 — a missing `fallback` is the "render-all vs. 404-on-miss" lever, not an error. Augment `EntryTypeRegistry` / `TaxonomyRegistry` alongside `registerEntryType` to teach the builders your own types.

The dev debug bar's Template panel now shows the full resolution walk for each request — every rule with a matched / skipped / never-evaluated status and its predicate outcome — so it's clear why a page got the template it did.

**Breaking changes** (theme and plugin authors):

- `templates` must be a `TemplateRule[]` (or a bare component as fallback shorthand). The slug-keyed object form (`{ index, single, "single-post", "404", … }`) is removed. Map old slots to builders: `index` → `fallback`, `single` → `entry`, `single-<type>` → `forEntryType("<type>").template`, `archive` → `archive`, `<taxonomy>` → `forTaxonomy(...)`, `404`/`500` → `notFound`/`serverError`.
- The `notFound` export from `@plumix/core` / `plumix` is now the 404 **template builder**, not the HTTP `Response` helper (which is internal). Build error responses your own way.
- `defineTemplate`'s `prefetchListingLoaders` field is renamed to `prefetchArchiveLoaders`.
- The `template:hierarchy` hook filter is removed; template targeting is compile-time via the builders.
