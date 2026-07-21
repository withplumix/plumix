---
"@plumix/core": minor
---

Let plugins register their own archive types — a URL pattern set + resolver + typed data + builder + feed — with no core changes, opening the previously-closed `RouteIntent`/resolver seam.

`ctx.registerArchiveType(name, { routes, resolve, feed? })` adds a whole archive: matched URLs dispatch to the resolver (which returns `{ data, title }` or `null` → 404), and the data templates through `forArchiveType(name)` — a targeted builder that autocompletes and types `data` from an augmentable `ArchiveTypeRegistry`, exactly like `forEntryType` / `forTermTaxonomy`.

```ts
// plugin
ctx.registerArchiveType("event-series", {
  routes: ["/events/:series", "/events/:series/page/:page(\\d+)"],
  resolve: (ctx, params) =>
    params.series
      ? { data: { kind: "custom", name: "event-series", series: params.series, ... }, title: `…` }
      : null,
  feed: { routes: ["/events/:series/feed"], filter: (ctx, params) => /* SQL | null */ },
});

// typing (declare once)
declare module "@plumix/core" {
  interface ArchiveTypeRegistry {
    "event-series": { data: EventSeriesData };
  }
}

// theme
defineTheme({ templates: [forArchiveType("event-series").template(EventArchive)] })
```

The five built-in archives (single/archive/taxonomy/author/date) are unchanged and keep working — the generalization adds a `custom` `RouteIntent` + `ResolvedNode` kind alongside them.

Also reworks the feed subsystem: a registered archive can own an RSS/Atom feed (its base route serves both formats), and **nested-term feeds no longer 404** — a nested term's feed is served at its nested path (`/region/europe/france/feed`) when the taxonomy exposes hierarchical URLs.
