---
"@plumix/plugin-seo": minor
---

Pages each entry type's sub-sitemap by id instead of by page number, so a late page costs what the first does and no sitemap request sorts the whole type or reads every entry's meta. Breaking: an entry type's sub-sitemaps move from `/sitemap-entries-<type>-<page>.xml` to `/sitemap-entries-<type>-<after>.xml`, named by the id each page starts after (the first is `-0.xml`), and a `seo.sitemap.urls` subscriber gets that id as `after` for an entry type's scope instead of `page` (the new `SitemapPage` type; narrow with `"after" in at`). Take the URLs from `/sitemap.xml`. Entries marked **Hide from search engines** are now kept in a `seo_noindexed_entries` table that `plumix migrate` creates and fills from the entries already marked. Sitemaps now stay at the edge for a day (`s-maxage=86400`) instead of an hour; a publish still retires them.
