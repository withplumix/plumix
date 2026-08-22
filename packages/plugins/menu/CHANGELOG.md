# @plumix/plugin-menu

## 0.2.0

### Minor Changes

- [#1847](https://github.com/withplumix/plumix/pull/1847) [`6ed6444`](https://github.com/withplumix/plumix/commit/6ed6444d4deacc11040cc56e3d673303be94170b) Thanks [@nasyrov](https://github.com/nasyrov)! - Changes `menu.get` to send each item's `meta` already parsed — the declared `MenuItemMeta`, or `null`
  when the stored JSON matches no known kind — instead of the raw column. `MenuItemMeta` and its arms
  are now type aliases rather than interfaces, so the shape assigns to the `entries.meta` column
  directly. A menu item whose stored meta doesn't parse now loads in the editor as an empty custom-URL
  item, so it stays visible, stays fixable, and no longer rejects the whole save.

## 0.1.3

### Patch Changes

- [#1775](https://github.com/withplumix/plumix/pull/1775) [`3569cb3`](https://github.com/withplumix/plumix/commit/3569cb3f2188ec7d7bdaeb313f0e3d8ca9da7b7b) Thanks [@nasyrov](https://github.com/nasyrov)! - Route the menu plugin's remaining drizzle query operators through the
  `plumix/db` seam and drop its direct `drizzle-orm` dependency.

  The core root-barrel cleanup ([#1774](https://github.com/withplumix/plumix/issues/1774)) moved the RPC router's operators onto
  `plumix/db` and its tables onto `plumix/schema`, but the server resolvers
  (`getMenuByName`, `getMenuForLocation`) and their tests still imported
  `and`/`eq`/`inArray` straight from `drizzle-orm`. Menu defines no tables of its
  own, so those operators now come from `plumix/db` too and the package no longer
  declares `drizzle-orm` — the direct-write follow-up deliberately left out of
  [#1774](https://github.com/withplumix/plumix/issues/1774) ([#1700](https://github.com/withplumix/plumix/issues/1700)/[#1766](https://github.com/withplumix/plumix/issues/1766)). No behavior or public-surface change.

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

- [#1523](https://github.com/withplumix/plumix/pull/1523) [`dad17a3`](https://github.com/withplumix/plumix/commit/dad17a3f71a8881b5b5ed1dbd387c0f8d2aa520e) Thanks [@nasyrov](https://github.com/nasyrov)! - The entry lookup-adapter scope can now express a status constraint (`scope: { entryTypes, status: "published" }`), pushed into the adapter's own `WHERE`. The menu resolver's published pre-filter query is gone — entry refs resolve in a single batched read instead of two back-to-back queries over the same ids on every public render. The admin picker keeps the current default (no status constraint, drafts admitted).

- [#1525](https://github.com/withplumix/plumix/pull/1525) [`ef67f5c`](https://github.com/withplumix/plumix/commit/ef67f5c5ad3167edb68c02ab6056b9eca3e93930) Thanks [@nasyrov](https://github.com/nasyrov)! - `getMenusForLocations` batches location-bound menu resolution: one `settings` read covering every requested location plus one shared resolve pass over the bound slugs, so resolving several registered locations directly no longer fans out per location. `getMenuForLocation` keeps its signature as the single-location wrapper, and each location's `menu:tree` hook pass still sees its own `location` — even when two locations bind the same menu.

- [#1516](https://github.com/withplumix/plumix/pull/1516) [`8704a7a`](https://github.com/withplumix/plumix/commit/8704a7a46e89bb8bb09d9a99c0d795b837e104ec) Thanks [@nasyrov](https://github.com/nasyrov)! - Menu resolution is now batched across locations: the `menus` template dep resolves every declared slug through a new `getMenusByName` with a query count flat in the number of menus — one term lookup, one item read, and one ref-resolution pass shared across all of them — instead of ~5 queries per location on every public render. `getMenuByName` keeps its signature as a single-slug wrapper over the same path.

- [#1526](https://github.com/withplumix/plumix/pull/1526) [`bcd76ed`](https://github.com/withplumix/plumix/commit/bcd76ed4240f30daa79a2a421d042d2afb6f9aa3) Thanks [@nasyrov](https://github.com/nasyrov)! - Reference meta fields now store plain ids (or id arrays) — the write-time snapshot machinery is gone: the object value-shape (`ReferenceTarget.valueShape`), the adapter cached-fields seam (`LookupResult.cached`), and the write-time cached-reference rewrite are all removed. Values stored under the old `{ id, ... }` shape self-heal transparently: reads yield the id, and the entity's next save persists the plain form. `LookupResult` gains a first-class `href` (entry permalink / term archive) that menu resolution reads directly. The media `media()` / `mediaList()` builders drop the `MediaValue` type (`default` is now an id / id array), and the admin media pickers resolve labels through the batched lookup path instead of stored snapshots.

- [#1520](https://github.com/withplumix/plumix/pull/1520) [`902a922`](https://github.com/withplumix/plumix/commit/902a922b8dc5652700cc9cbbb8f00726b34a482c) Thanks [@nasyrov](https://github.com/nasyrov)! - Repeated reads dedupe within a request through a new request-scoped read-through memo on `ctx` (`ctx.memo`, plus a `memoBatch` helper for per-id memoization over one batched query). The hot single-row lookups now read through it inside the existing service functions: the `site` settings group (head defaults, SEO surfaces, and the settings template dep share one query), author rows in `buildResolvedEntries`, the entry-type probe (new shared `readEntryType`, deduping the comments template dep against the blog related-posts loader), and the menu query cluster (shared between the `menus` template dep and `getMenuForLocation`, which now rides `ctx.memo` instead of a bespoke WeakMap). `plumix/test` gains `createTracedContext` and `createRequestMemo` for query-count assertions and `AppContext` stand-ins.
