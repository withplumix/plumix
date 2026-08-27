# @plumix/plugin-menu

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

- [#1847](https://github.com/withplumix/plumix/pull/1847) [`6ed6444`](https://github.com/withplumix/plumix/commit/6ed6444d4deacc11040cc56e3d673303be94170b) Thanks [@nasyrov](https://github.com/nasyrov)! - Changes `menu.get` to send each item's `meta` already parsed — the declared `MenuItemMeta`, or `null`
  when the stored JSON matches no known kind — instead of the raw column. `MenuItemMeta` and its arms
  are now type aliases rather than interfaces, so the shape assigns to the `entries.meta` column
  directly. A menu item whose stored meta doesn't parse now loads in the editor as an empty custom-URL
  item, so it stays visible, stays fixable, and no longer rejects the whole save.

### Patch Changes

- [#1897](https://github.com/withplumix/plumix/pull/1897) [`5fbb8cf`](https://github.com/withplumix/plumix/commit/5fbb8cf6faa061554f32c4f3ca490be03449a3d4) Thanks [@nasyrov](https://github.com/nasyrov)! - Types the stored block tree and the plugin dictionaries that describe serialized data with the public `JsonObject` / `JsonValue` types.

  **Source-breaking for block and theme authors** on the type level only — the emitted JS is unchanged. `BlockNode` is now a `type` alias rather than an `interface`, and its `attrs` is a `JsonObject`; the same goes for `BlockVariation.attrs`, `BlockSpec.defaults`, a transform's `mapAttrs`, a block loader's `attrs`, and `ResponsiveStyleSlot` / `VisibilityFlags`. A node built from a `Record<string, unknown>` no longer assigns, and an entry added to `BlockTypeRegistry` has to be spelled as a `type` over an object literal — TypeScript withholds the implicit index signature an `interface` would need.

  What a block's `render` receives is deliberately _not_ JSON and is now named and exported: `MaterializedAttrs` is the stored bag with each slot key replaced by the component that renders that slot's children. `BlockNodeRenderProps`, `BlockNodeComponent` and `BlockSpec` default their `Attrs` parameter to it.

  **Source-breaking for the editor's plugin-field seam.** `@plumix/admin-editor`'s `PluginFieldControlProps` now types `rhf.onChange` as `(next: JsonValue) => void` and the sibling block `attrs` as a `JsonObject`; `rhf.value` stays `unknown`, because the same controls also serve metaboxes, where RHF hands over a live `Date` for a temporal field. The `registerPluginFieldType` registry contract itself is unchanged.

  `@plumix/plugin-audit-log` holds a caller's own `properties` to JSON: `ctx.audit.log({ properties })` and an event definition's `extra` return no longer accept a `Date`, which reached storage as an ISO string anyway. The row's stored envelope stays open — its diff half is built from live entity columns.

  Island props keep their open type — the prop codec encodes `Date`, `Map`, `Set`, `BigInt`, `URL` and the typed arrays so they survive hydration, which a JSON type would deny.

  `@plumix/runtime-cloudflare` types the CF Access JWT payload as jose's `JWTPayload` instead of a loose dictionary.

- [#1882](https://github.com/withplumix/plumix/pull/1882) [`b6dcb7f`](https://github.com/withplumix/plumix/commit/b6dcb7f0a507dd1989e0ca3b86b0fb16927487f0) Thanks [@nasyrov](https://github.com/nasyrov)! - Types the JSON columns and the meta write path with the public `JsonObject` / `JsonValue` types. `entries.meta`, `terms.meta`, `users.meta` and `auth_tokens.payload` now read as `JsonObject` instead of `Record<string, unknown>`, and a sanitized meta patch carries `JsonValue` values.

  **Source-breaking for plugin authors** on the type level only — the emitted JS is unchanged. A read procedure hands its row back with meta already resolved by the field adapters, so the output filters for `entry.list`/`get`/`create`/`update`/`duplicate`, `term.list`/`get`/`create`/`update` and `user.get`/`update` now take `WithResolvedMeta<Entry | Term | User>` rather than the bare row; a filter annotated with the row type no longer assigns. `MetaPatch.upserts` is a `Map<string, JsonValue>`, and writing a `meta` column from a `Record<string, unknown>` needs the value proved first. `ResolvedMeta` and `WithResolvedMeta` are exported from `plumix`.

  One behaviour change, in a path that could not previously succeed: a meta field whose `.sanitize()` callback returns `undefined` now leaves its key untouched instead of upserting `undefined`, which reached the driver as an unbindable `json_set` parameter.

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
