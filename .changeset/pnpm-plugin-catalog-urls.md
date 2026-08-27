---
"plumix": patch
---

Fixes plugin admin catalogs never being staged or fetched on a pnpm-installed site. The bundler
decided a plugin's catalogs were already baked into the admin bundle by asking whether
`node_modules/@plumix/plugin-<id>` is a symlink — but under pnpm every package is one, registry
tarballs included, so it skipped emitting catalog URLs for plugins that bundle had never seen. It
now resolves the entry and keeps the skip only for a target inside the plumix monorepo's
`packages/plugins`, the directory the bundle's glob actually covers.

npm sites were never affected, and a pnpm site whose plugin versions matched its `@plumix/admin`
saw correct translations anyway, since that bundle carries first-party catalogs of its own. What
was broken is everything outside that overlap: a plugin newer than the installed admin, a plugin
its glob never saw, or a string added since it was built, all fell back to English with no way to
load the catalog that would have covered them. pnpm and npm sites no longer diverge here.
