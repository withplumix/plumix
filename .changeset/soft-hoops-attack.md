---
"@plumix/core": minor
---

Adds a `seo:og_image` filter so a plugin or site can supply a page's social
image, and emits `og:image:width`, `og:image:height` and `twitter:image`
alongside `og:image`. The filter sits between an entry's role-tagged image
(`.ogImage()`, then `.featured()`) and the site-wide default, so it never
overrides an author's explicit choice. A template that declares its own
`og:image` keeps the whole group — no size or `twitter:image` is appended
beside it.
