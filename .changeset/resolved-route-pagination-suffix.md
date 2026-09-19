---
"plumix": minor
---

Adds `ctx.resolvedRoute`, the content route a public request matched: `{ pattern, params }` as the pattern was declared and the params it captured, `null` on every path the content router did not match. A plugin rendering into the page reads it to address the page's own URL space without re-matching the URL.

Adds `FRAMEWORK_PAGINATION_SUFFIX` (`/page/:page(\d+)`) to `plumix/plugin`, the tail every paginated route ends in. Core now builds all of its paginated routes from it, so entry-type and taxonomy archives match a later page only when the page is a number, as the front page, search, author and date archives already did: `/shop/page/abc` no longer reaches the archive and falls through to the next route. A plugin archive's routes ending in the suffix are matched ahead of its other routes, so a multi-segment capture such as `/docs/:path+` no longer swallows `/docs/a/page/2`.
