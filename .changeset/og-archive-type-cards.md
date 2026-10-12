---
"@plumix/plugin-og": minor
"plumix": minor
---

Gives a `registerArchiveType` page a social card. Once a theme declares a `card.forArchiveType(name)` rule, every page of that archive carries `og:image` in its head, served from `/_plumix/og/card/archive-type/<name>/<param>/<value>…/<digest>.png` with the same storage, digest and edge caching as other cards. The route rebuilds the page through the archive's own `resolve` as an anonymous visitor, so a URL with no page, a page its `access` policy hides from anonymous visitors, or a listing archive that lists nothing gets no card. The stored card is purged with its page's tags. `plumix/plugin` adds `resolveArchiveTypePage`, which resolves a plugin archive's page from its route params through the same call core's route makes.
