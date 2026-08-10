---
"@plumix/core": minor
---

Let custom archives contribute a sitemap scope, and give `seo:sitemap:urls` the request context.

`registerArchiveType` now accepts a `sitemap` provider (`{ count, urls }`), mirroring
its existing `feed` option. Core folds the archive's URL space into the native
sitemap index under a paginated `/sitemap-<name>-<page>.xml` scope: `count(ctx)`
drives index pagination (kept cheap — no URL scan), and `urls(ctx, page)` produces
each 1000-URL page. Previously a custom archive was neither an entry type nor a
taxonomy, so its URLs were absent from sitemaps entirely.

The `seo:sitemap:urls` filter now also receives the 1-based `page` and the request
`ctx` — `(urls, scope, page, ctx)`. A subscriber can now query the DB to inject
rows and paginate its adjustments, not just reshape statically-known URLs. The new
arguments are appended, so existing `(urls, scope)` subscribers are unaffected.
