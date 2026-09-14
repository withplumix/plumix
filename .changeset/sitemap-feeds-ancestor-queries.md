---
"@plumix/plugin-seo": patch
"@plumix/plugin-feeds": patch
---

Fixes the sitemap and feeds running one ancestor query per nested page or term, so a sitemap page of hierarchical content now costs a fixed number of queries. Requires the `plumix` release that adds `buildEntryPermalinks` and `buildTermArchiveUrls`.
