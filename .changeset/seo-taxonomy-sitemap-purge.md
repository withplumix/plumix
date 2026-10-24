---
"@plumix/plugin-seo": patch
---

Fixes a taxonomy's sitemap staying cached after a term is created or deleted when the taxonomy lists no entry types. Every taxonomy's sitemap and the sitemap index are now purged by a term create or delete in it, and a taxonomy's sitemap is no longer purged when an entry is published.
