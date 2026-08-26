# @plumix/plugin-blog

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
