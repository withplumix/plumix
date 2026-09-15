# @plumix/plugin-menu

## 0.3.0

### Minor Changes

- [#2349](https://github.com/withplumix/plumix/pull/2349) [`8d68b43`](https://github.com/withplumix/plumix/commit/8d68b439a40f1c2ee53ad8ab35d4ced945881e4d) Thanks [@nasyrov](https://github.com/nasyrov)! - Removes `getRegisteredLocations` and `clearRegisteredLocations` from `@plumix/plugin-menu/server`. The locations declared in `menu({ locations })` now belong to the install that declared them, so a second app booted in the same process no longer replaces the locations the menu admin validates against.

- [#2326](https://github.com/withplumix/plumix/pull/2326) [`a47bd1a`](https://github.com/withplumix/plumix/commit/a47bd1a5ccfe841b038823c401275dcab8fb47ef) Thanks [@nasyrov](https://github.com/nasyrov)! - Fixes menu locations never reaching the rendered site. The `menus` template dep is now keyed by location id: `defineTemplate({ menus: ["primary"] })` renders the menu assigned to the `primary` location in the admin, or `null` when nothing is assigned. Before, the dep looked the key up as a menu slug and ignored the assignment. A theme that declared menu slugs should declare the locations those menus are assigned to instead. `menu:tree` subscribers now see the `location` on renders that go through the dep.

### Patch Changes

- [#2379](https://github.com/withplumix/plumix/pull/2379) [`e686d78`](https://github.com/withplumix/plumix/commit/e686d781f731f23a7dd74684d4ab349893382a5f) Thanks [@nasyrov](https://github.com/nasyrov)! - Fixes menu items silently disappearing from the rendered menu when they link to an entry type or taxonomy that leaves `isPublic` unset. The public render now uses the same eligibility rule as the menu editor, so items of a public type marked `isShownInMenus: false` are also left out of the render, matching the editor, which already shows them as broken.

- [#2383](https://github.com/withplumix/plumix/pull/2383) [`a4b88f0`](https://github.com/withplumix/plumix/commit/a4b88f03f2847535200317cfbe26abcb7aad7372) Thanks [@nasyrov](https://github.com/nasyrov)! - Stops the menu item picker from offering entry types and taxonomies registered with `isPublic: false`, even when they set `isShownInMenus: true`. Such types have no public URL, so their items never rendered in a menu. Menu items already saved against such a type now show as broken in the menu editor, so they can be removed or replaced with a custom URL. `isShownInMenus` now only hides a public type.

- [#2374](https://github.com/withplumix/plumix/pull/2374) [`ae40bd7`](https://github.com/withplumix/plumix/commit/ae40bd73a6b738092cb4fc1a48eb1b07bbe12b96) Thanks [@nasyrov](https://github.com/nasyrov)! - Fixes `pnpm i18n:extract` destroying `locales/*.po` — it now routes through `plumix i18n extract`, which refuses to run against this package's hand-authored catalog instead of silently rewriting it.

- [#2393](https://github.com/withplumix/plumix/pull/2393) [`4017430`](https://github.com/withplumix/plumix/commit/401743028e66c974f51a18e2461815f5a1cb4eac) Thanks [@nasyrov](https://github.com/nasyrov)! - Reads entry type and taxonomy visibility from the registered type, so these plugins now need the plumix release that resolves visibility at registration. On an older plumix they treat a type that never set `isPublic` as not public.

- [#2410](https://github.com/withplumix/plumix/pull/2410) [`f3b88c4`](https://github.com/withplumix/plumix/commit/f3b88c413ba76181ff2e8d2f63647c551e0022f6) Thanks [@nasyrov](https://github.com/nasyrov)! - Types `createPluginRpcClient` by the plugin's router: `createPluginRpcClient<typeof router>("menu")` now returns a client with one function per procedure, nested the way the router is (`rpc.locations.list()`), with inputs and outputs inferred from the server's handlers. `PluginRpcClient`, `PluginRpcInputs`, `PluginRpcOutputs` and `PluginRpcRouter`, on `plumix/admin`, name the router, the client and its procedure types. The untyped `rpc.call<T>("procedure", input)` form is gone: import the router type from the plugin's server module with `import type` and pass it as the type argument. The first-party plugins call through the typed client and now require `plumix` 0.23.0 or later.

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
