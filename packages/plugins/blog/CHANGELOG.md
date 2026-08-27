# @plumix/plugin-blog

## 0.2.1

### Patch Changes

- [#2010](https://github.com/withplumix/plumix/pull/2010) [`d9cb874`](https://github.com/withplumix/plumix/commit/d9cb87447fd859a1d940dd8ce990571b79b88469) Thanks [@nasyrov](https://github.com/nasyrov)! - Declares the locales each plugin actually ships catalogs for. These five ship
  `ar`/`de`/`uk`/`zh-CN` translations, but their `i18n` slot still named only the
  source locale (`pages` named `en` and `de`), so `buildManifest` projected an empty
  catalog map, omitted the plugin from `pluginI18n`, and never staged a file — a site
  installing the plugin from npm and enabling `ar`, `de`, `uk`, or `zh-CN` got English
  admin chrome in those locales. The translations landed in [#818](https://github.com/withplumix/plumix/issues/818)/[#819](https://github.com/withplumix/plumix/issues/819)/[#822](https://github.com/withplumix/plumix/issues/822)/[#823](https://github.com/withplumix/plumix/issues/823), which
  widened each plugin's `lingui.config.ts` but not the manifest slot;
  `@plumix/plugin-comments` and `@plumix/plugin-og` declared the full set from the
  start and are unaffected. En-only sites see no change either way: a declared locale
  the site has not enabled is intersected out before any URL is emitted.

- [#2009](https://github.com/withplumix/plumix/pull/2009) [`17fa3cc`](https://github.com/withplumix/plumix/commit/17fa3cc4c852a6590bd72696cf535b76adbf4344) Thanks [@nasyrov](https://github.com/nasyrov)! - Ships each plugin's compiled Lingui catalogs in the published tarball. Every one
  of these plugins declares an `i18n` slot pointing at `./locales`, which the
  plumix Vite plugin copies out of the installed package at build time — but
  `package.json#files` allowlisted only `dist`, so the directory was absent from
  the tarball and a site installing the plugin from npm failed `plumix build` with
  `adminAssetNotFound`. Inside this repo a plugin resolves to a symlinked source
  tree, where the catalogs are always present, which is why nothing caught it.

## 0.2.0

### Minor Changes

- [#1953](https://github.com/withplumix/plumix/pull/1953) [`ed83fe4`](https://github.com/withplumix/plumix/commit/ed83fe49e45dc6919c791257f31c546bfaaaf5bd) Thanks [@nasyrov](https://github.com/nasyrov)! - `blog` is now a factory that accepts a per-registration override, so a site can move the post type off `/posts`, give it an archive, retitle it, or skip a taxonomy without forking the plugin.

  Each of `post`, `category` and `tag` takes a partial of the options the plugin passes to `registerEntryType` / `registerTermTaxonomy`; object-valued options merge key by key, arrays replace or compose via `(prev) => next`, and `false` skips the registration. `relatedPosts` takes a `limit` or `false`.

  Breaking: `blog` must now be called. Update `plugins: [blog]` to `plugins: [blog()]`.

## 0.1.2

### Patch Changes

- [#1731](https://github.com/withplumix/plumix/pull/1731) [`c5facfe`](https://github.com/withplumix/plumix/commit/c5facfee050d3f5880de31dc6866dd48c4ac3d41) Thanks [@nasyrov](https://github.com/nasyrov)! - Augment the public `plumix` specifier instead of the `plumix/plugin` subpath.

  These plugins declared their `TemplateDepRegistry`, `ReferenceHydrationShapes`,
  `FilterRegistry`, `ActionRegistry`, and `AppContextExtensions` contributions via
  `declare module "plumix/plugin"`. A theme augmenting a registry through the root
  `plumix` specifier (the documented convention, [#1691](https://github.com/withplumix/plumix/issues/1691)) would not co-merge with a
  `plumix/plugin` augmentation of the same interface — declaration merging
  fractures across specifiers, dropping one side's keys. All augmentations now
  target `declare module "plumix"` so themes and plugins share one merged view.

  No runtime or public-API change: the plugins' value imports still come from
  `plumix/plugin`, and consumers read the contributed kinds through the same
  `defineTemplate` / reference-field surfaces as before.

## 0.1.1

### Patch Changes

- [#1520](https://github.com/withplumix/plumix/pull/1520) [`902a922`](https://github.com/withplumix/plumix/commit/902a922b8dc5652700cc9cbbb8f00726b34a482c) Thanks [@nasyrov](https://github.com/nasyrov)! - Repeated reads dedupe within a request through a new request-scoped read-through memo on `ctx` (`ctx.memo`, plus a `memoBatch` helper for per-id memoization over one batched query). The hot single-row lookups now read through it inside the existing service functions: the `site` settings group (head defaults, SEO surfaces, and the settings template dep share one query), author rows in `buildResolvedEntries`, the entry-type probe (new shared `readEntryType`, deduping the comments template dep against the blog related-posts loader), and the menu query cluster (shared between the `menus` template dep and `getMenuForLocation`, which now rides `ctx.memo` instead of a bespoke WeakMap). `plumix/test` gains `createTracedContext` and `createRequestMemo` for query-count assertions and `AppContext` stand-ins.
