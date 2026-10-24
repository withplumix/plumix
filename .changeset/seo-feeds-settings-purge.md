---
"@plumix/plugin-seo": patch
"@plumix/plugin-feeds": patch
---

Fixes an SEO settings save emptying every cached page and sitemap: a save now purges only the responses that read the group it wrote, so saving a hand-written `robots.txt` keeps pages and sitemaps stored at the edge. Feeds still refresh on a `site` settings save.
