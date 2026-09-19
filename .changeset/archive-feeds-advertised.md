---
"@plumix/plugin-feeds": minor
---

Advertises a plugin archive's feed. Every page of a `registerArchiveType` archive with a `feed` now carries the `<link rel="alternate">` RSS and Atom pair, and a later page points at the feed of the route it paginates. Nothing is advertised where the archive's `filter` answers `null`, or where another feed already claimed the path.

Removes `feed.routes` (breaking). The feed paths now follow from the archive's own routes: each route serves RSS at `<route>/feed` and Atom at `<route>/feed/atom`, and a route ending in `FRAMEWORK_PAGINATION_SUFFIX` gets none. Drop `routes` from the `feed` object; an archive that declared `/events/:series/feed` for the route `/events/:series` keeps the same URL.
