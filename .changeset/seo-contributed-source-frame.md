---
"@plumix/plugin-seo": patch
---

Fixes a contributed sitemap source's `ctx.cache.reads` tagging the sitemap under seo's namespace: seo now runs the source's `count`, `urls` and `lastmod` in the contributing plugin's frame, so that plugin's `ctx.cache.changed` retires the sub-sitemap and the index. Needs `plumix` 0.28 or later.
