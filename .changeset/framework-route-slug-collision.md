---
"plumix": patch
---

Fixes entry types and taxonomies whose URLs a framework route would serve instead. A public registration with `rewrite.slug` set to `search` or `authors`, or a `hasArchive` of `search`, used to compile, and then its permalinks, sitemap entries and canonical tags pointed at the search or author page. Boot now throws a `RouteCompileError` naming the registration and the slug.
