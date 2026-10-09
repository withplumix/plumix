---
"@plumix/plugin-seo": minor
---

Fixes the cached sitemap of a taxonomy registered with no `entryTypes` outliving a term change. A contributed sitemap source takes `reads` in place of `tags`, and `SITEMAP_TAG` becomes `SITEMAP_SET`, which a plugin passes to `recordWrite` to retire the whole sitemap set. Saving an SEO settings group now purges only the cached responses that read it rather than every page of every registered type. Requires plumix 0.25.0.
