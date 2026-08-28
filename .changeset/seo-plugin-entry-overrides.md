---
"@plumix/plugin-seo": minor
---

Adds a per-entry and per-term **Search & social** box, and decides indexability in one place.

An editor can now set a search title, a search description, a canonical override, a social image
URL and `noindex` / `nofollow` on any entry or term. The fields ride the entity's own Save — no
second save action, no new table — and store in the `meta` column under `seo_`-prefixed keys,
because meta-box ids are deduplicated by core while meta keys are one flat namespace shared by
every box on an entity.

Scope is derived, not configured: every publicly-visible entry type and taxonomy gets the box, so
internal types like menu items are excluded with no configuration. For a type that is public but
that nobody writes search copy for, name it:

```ts
seo({ metaBox: { exclude: ["landing_page"] } });
```

**One predicate, several consumers.** Whether a page is offered to a search engine is decided by
one ordered set of assertions — `site_private`, then `entry_override`, then `search_results`,
then `default` — which short-circuits on the first that fires and reports the reason alongside the
boolean. The robots directive reads that answer; the sitemap asks the same two questions of whole tables
instead, as a `WHERE` over the meta column, so what they share is the meta key and this order
rather than a call. Either way a page can no longer claim `noindex` in its head while still being
listed in the sitemap, and the count driving the index's pagination and the page it pages agree.
The exclusion tests `json_type(...) is not 'true'` rather than extracting the value, because
extraction collapses JSON `true` and JSON `1` into one integer and would drop a page the head
still said `index` for. The reason string is what a later slice shows an author, instead of a bare
toggle.

The `og:image` chain gains the box's social image URL as its second link — above a generated card
and the site default, below an entry type's own `.ogImage()` role field — so a deliberate choice
is never overruled by a generated one.

All of it gap-fills, so a theme keeps the last word: a template that sets `document.title` or
declares its own canonical keeps them, and the editor's override then reaches `og:title` and
`og:url` alone. A search title is the page's title, so a theme's `titleTemplate` composes it.

Two head tags this plugin did not write before are now its own. `<link rel="canonical">` is
written here rather than left to core's gap-filler, since core would otherwise declare the derived
URL an editor overrode; with no override the two agree and core simply finds the tag set.
`<title>` is written only when an editor set a search title, so a page with no override still goes
through the theme's own composition.
