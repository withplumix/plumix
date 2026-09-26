---
"@plumix/plugin-pages": minor
---

Changes `pages` from a descriptor to a factory that accepts `{ page }`: an override for the `page` entry type (`pages({ page: { rewrite: { slug: "p" } } })`), or `false` to skip it. **Breaking:** replace `pages` with `pages()` in your `plugins` array.
