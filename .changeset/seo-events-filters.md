---
"@plumix/plugin-seo": minor
---

Adds the plugin's filters to the `seo` export: `seo.ogImage`, `seo.robotsTxt`, `seo.llmsTxt`, `seo.sitemap.urls`, `seo.schema.needs`, `seo.schema.piece` and `seo.schema.graph`, so another plugin subscribes with `ctx.filters.add(seo.ogImage, …)` with no `declare module`. `seo()` still installs the plugin, and the head, robots.txt, llms.txt, sitemaps and structured-data graph are unchanged.

Breaking: the `seo:*` string names are removed from `FilterRegistry`. Handlers take `(value, input, ctx)`: replace `addFilter("seo:og_image", (image, data, ctx, featured) => …)` with `ctx.filters.add(seo.ogImage, (image, { data, featured }, ctx) => …)`, `addFilter("seo:sitemap:urls", (urls, scope, page, ctx) => …)` with `ctx.filters.add(seo.sitemap.urls, (urls, { scope, page }, ctx) => …)`, `addFilter("seo:schema:needs" | "seo:schema:piece", (value, name, facts, ctx) => …)` with `ctx.filters.add(seo.schema.needs | seo.schema.piece, (value, { name, facts }, ctx) => …)`, and `addFilter("seo:schema:graph", (graph, facts, ctx) => …)` with `ctx.filters.add(seo.schema.graph, (graph, { facts }, ctx) => …)`. `seo:robots-txt` and `seo:llms-txt` become `seo.robotsTxt` and `seo.llmsTxt`.
