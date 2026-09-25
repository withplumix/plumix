---
"@plumix/plugin-seo": patch
---

Fixes the sitemap listing entries core does not publish: a sub-sitemap now takes its entries from core's `publicEntryRows`, so a published entry with no publish date is left out, as it is from archives and feeds.
