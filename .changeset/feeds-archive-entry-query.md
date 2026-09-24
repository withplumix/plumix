---
"@plumix/plugin-feeds": minor
---

Makes every feed its archive's own entry query, so a feed carries exactly what its archive's page lists, newest first and capped at twenty whatever order the page uses. Breaking changes:

- **`feed.scope` is removed.** A plugin archive declares its entries once, in `entries`, and opts into a feed with `feed: true`: replace `feed: { scope: (q, params) => … }` with `entries: (q, params) => …` and `feed: true`. `feed` is refused on an archive without `entries`. The object form `feed: {}` is reserved for future feed-only options.
- **Pages leave the site, author and date feeds.** An entry of a hierarchical type is no longer in `/feed`, `/authors/<slug>/feed` or `/YYYY[/MM[/DD]]/feed`, matching those pages.
- **A type's feed moves to its archive page.** It is served at the type's `hasArchive` slug (`/news/feed` for `hasArchive: "news"`), and `/<type name>/feed` is gone. A type with no archive page — `hasArchive: false`, which includes `@plumix/plugin-blog`'s `post` — has no feed of its own; its entries are in `/feed`.
- **Discovery follows the page's archive.** A page advertises the feed of the archive that owns it, and a single entry no longer advertises the site feed.
- **`feed:items` receives a reshaped scope.** `scope.archive` names the archive as core's archive lookup does (`front-page`, `archive`, `taxonomy`, `author`, `date` or `custom`) and `scope.params` holds what its route captured; `scope.kind === "site"` becomes `scope.archive.kind === "front-page"`.
