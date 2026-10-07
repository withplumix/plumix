---
"@plumix/plugin-seo": minor
---

Honours `canonical: false` in a page's `document`: the page gets no canonical link, no `og:url` and no `url` on its structured-data `WebPage`, unless it declares its own canonical in `link` or an editor set a canonical override, which all three then follow.
