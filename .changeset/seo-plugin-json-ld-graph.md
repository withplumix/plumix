---
"@plumix/plugin-seo": minor
"@plumix/core": minor
"plumix": minor
---

Emits a cross-referenced JSON-LD graph and breadcrumbs.

Every indexable page now carries one `<script type="application/ld+json">` holding a graph rather
than a flat object: `WebSite`, the `Organization` or `Person` the site represents, `WebPage`,
`Article`, `BreadcrumbList`, `ImageObject` and the author `Person`, each addressable by a URL
fragment and referencing the others by `@id` instead of repeating them. Identifiers derive from the
site root and the page's canonical URL, so two renders of one URL produce the same graph. A page
that is not an entry carries the site-level pieces without the article ones, and a piece with
nothing to say is absent rather than empty — a page with no social image has no `ImageObject` and
no `primaryImageOfPage` pointing at one.

**A page marked `noindex` emits no graph.** Structured data exists to make a page eligible for a
rich result and a page asking not to be indexed is not, so advertising one anyway would have the
page's graph and its robots directive say different things about it.

Three filters, matching the granularity the mature implementations settled on:

```ts
ctx.addFilter("seo:schema:needs", (needed, piece) =>
  piece === "breadcrumb" ? false : needed,
);
ctx.addFilter("seo:schema:piece", (piece, name) =>
  name === "publisher" ? { ...piece, sameAs: ["…"] } : piece,
);
ctx.addFilter("seo:schema:graph", (graph) => [...graph, myProductNode]);
```

**Breadcrumbs ship as data and as a component.** `Breadcrumbs` renders the trail a theme puts in
the page, and the `BreadcrumbList` in the graph is built from the same `breadcrumbTrail`, so what a
reader sees and what a search result claims cannot disagree. The trail is Home → the entry type's
archive, where it has one → the page itself, with the last step unlinked. Ancestors are not walked:
a hierarchical entry's parents and a nested term's parents would each cost a per-render round-trip.

**An editor can pick the type.** A new **Content type** field on the entry box retypes the article
piece — `Article`, `BlogPosting`, `NewsArticle` or `TechArticle` — keeping its `@id` and every
reference to it. A stored value outside the roster is not an answer. The field is on the entry box
only: a term page has no article piece for the choice to retype. A new **This site represents**
setting types the publisher piece as an `Organization` or a `Person`.

The plugin serializes the script itself. `<`, `>`, `&` and the U+2028 / U+2029 line separators
become `\uXXXX` escapes — the same string to a JSON reader, inert to an HTML tokenizer — so an
entry titled `</script><script>…` cannot close the element it sits in. This is deliberately not
core's job: core has no Content-Security-Policy, so there is no hash to register and no reason for
core to hold structured-data vocabulary. `serializeJsonLd` is exported for a plugin emitting a
script of its own. A theme that declared its own `application/ld+json` keeps it and this plugin
emits none.

The graph's `ImageObject` is the page's own image — an entry's explicit choice, a generated card or
its featured photo — and never the site-wide default. That last link of the `og:image` chain is a
sharing fallback, so passing it on would have every article claim the same bytes as its own
`#primaryimage`, and `Article.image` is read as representative of the article it hangs off. The
page is still shared with it; it is just not what the page is a picture of.

Core additionally exports `archiveSlugForEntryType`, joining the reverse-routing vocabulary
(`buildEntryPermalink`, `buildTermArchiveUrl`, `exposesHierarchicalUrls`) a plugin addressing the
URL space the router compiled already reads. It answers the second half of the router's own test —
the plugin asks the first half, whether the type is public, before calling it — so a breadcrumb
never links an archive that has no route.
