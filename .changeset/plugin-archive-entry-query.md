---
"plumix": minor
---

Adds `entries` to `registerArchiveType`: an archive declares the entry query it lists once, and core pages it, reads the order it carries, derives each route's `/page/:page` form, 404s past the last page, and tags the stored page with the types the query can list. `resolve` becomes optional there and receives the finished listing; a theme reads `data.entries` and `data.pagination` on a plugin archive exactly as on a built-in one. Entry queries gain `latest`, `oldest`, `orderBy` and `orderByMeta`, with the entry id always breaking ties. An archive without `entries` is unchanged.
