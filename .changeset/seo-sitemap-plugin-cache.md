---
"@plumix/plugin-seo": minor
---

Removes the `SITEMAP_TAG` export. A `seo.sitemap.urls` subscriber that adds rows from its own data now reads them with `ctx.cache.reads(key)` and retires the sitemap pages they joined with `ctx.cache.changed(key)`, instead of purging the set-wide tag.
