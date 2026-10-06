---
"@plumix/plugin-seo": minor
---

Adds `changefreq` and `priority` to sitemap URLs, and a `sitemaps` option on `seo()` where a site drops any scope from the sitemap or sets its URLs' defaults. Breaking: sub-sitemaps move to `/sitemap-entries-<type>-<page>.xml` and `/sitemap-terms-<taxonomy>-<page>.xml` (an entry type and a taxonomy sharing a name now both get one), and the `seo:sitemap:urls` filter receives the scope as `{ kind, name }` instead of its bare name. An archive `sitemap` named `entries` or `terms`, or starting `entries-` or `terms-`, fails the boot.
