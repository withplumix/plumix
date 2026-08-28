---
"@plumix/core": minor
"@plumix/plugin-og": minor
"@plumix/plugin-seo": minor
---

**Breaking.** Core no longer emits head meta. The description, the robots directive, the Open Graph
set, the Twitter card and the resolved social image now come from `@plumix/plugin-seo`; core keeps
the canonical URL, its `<link rel="canonical">` and the redirect that normalizes to it.

The boundary is drawn on consequence rather than on topic: core owns what would be _wrong_ without
a plugin installed, a plugin owns what would merely be _absent_. A canonical URL core redirects to
but never declares is a site contradicting itself. A missing description is a site that has not
opted in.

To keep today's head, install the plugin and add it to the config:

```ts
import { seo } from "@plumix/plugin-seo";

export default plumix({ plugins: [seo()] });
```

The plugin reproduces every tag core emitted and adds three it did not: `article:published_time`,
`article:modified_time` and `article:author` on an entry page. Contributions go through the existing
`render:document` filter and are gap-filled, and they run last on that chain whatever order the
`plugins` array is in — so a theme's own head tags keep winning exactly as they did, and so do
another plugin's.

The `seo:og_image` filter and the chain it sits in move to the plugin unchanged — an author's
explicit `.ogImage()` choice, then a subscriber's image, then the entry's `.featured()` photo, then
the site default, in that order however the `plugins` array is written. `@plumix/plugin-og`
contributes one link of it and now needs `@plumix/plugin-seo` installed to reach a page's head.

The site-wide indexing toggle and the default social image move out of core's Site identity settings
into the plugin's own group. A site upgrading keeps both answers with no migration step: the plugin
reads its group first and falls back to the legacy `site.public` and `site.default_og_image` rows,
and the settings form is seeded from the same fallback so the next save writes them through.

Fixes a latent crash the move surfaced: `applyFilter` isolates each handler by structured-cloning
the value, which throws outright on a payload carrying a function. A document manifest carries one
whenever a theme writes `titleTemplate` as a callback, so any `render:document` subscriber took the
page down on such a theme — nothing had one until now. A payload that cannot be cloned is handed
over as it stands; isolation is what it loses, not the render.

Core also gains two exports and one filter argument. `canonicalUrl` names the page the same way
core's own redirect does. `loadSettingsGroups` reads any settings group through the request memo
the template dep already uses, so a plugin joins that read instead of querying the table itself.
And `render:document` now receives the title core resolved for the page — an entry's expanded
title, an archive's label, a plugin archive's own — which a subscriber cannot derive, since the
per-page-kind logic is core's and a `registerArchiveType` title is known only to the resolver that
returned it. The argument is additive: an existing three-parameter subscriber is unaffected.
