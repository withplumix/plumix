---
"@plumix/plugin-seo": patch
---

Removes `tags` from a contributed sitemap source: a source's pages are stored under what its `count`, `urls` and `lastmod` read, so a source that lists entries through `compileEntryQuery` is retired by a publish of what it lists. Entry scopes and `llms.txt` read their entries the same way.
