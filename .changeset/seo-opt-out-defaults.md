---
"@plumix/plugin-seo": minor
---

Adds `llmsTxt`, `articleTags` and `structuredData` options to `seo()`. Set any of them to `false` to drop `/llms.txt`, the `article:*` tags or the JSON-LD graph. A page that was not found now carries only the robots directive: no description, Open Graph, Twitter or verification tags.
