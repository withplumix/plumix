---
"@plumix/plugin-seo": minor
---

Removes the SERP preview helpers from the package root: `resolveSerp`, `SERP_TITLE_LIMIT`, `SERP_DESCRIPTION_LIMIT` and the `SerpOverrides`, `SerpPreview` and `SerpResult` types. Only this plugin's own editor preview used them, and there is no replacement.
