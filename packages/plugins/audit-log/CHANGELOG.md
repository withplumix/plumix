# @plumix/plugin-audit-log

## 0.1.3

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

## 0.1.2

### Patch Changes

- [#1897](https://github.com/withplumix/plumix/pull/1897) [`5fbb8cf`](https://github.com/withplumix/plumix/commit/5fbb8cf6faa061554f32c4f3ca490be03449a3d4) Thanks [@nasyrov](https://github.com/nasyrov)! - Types the stored block tree and the plugin dictionaries that describe serialized data with the public `JsonObject` / `JsonValue` types.

  **Source-breaking for block and theme authors** on the type level only — the emitted JS is unchanged. `BlockNode` is now a `type` alias rather than an `interface`, and its `attrs` is a `JsonObject`; the same goes for `BlockVariation.attrs`, `BlockSpec.defaults`, a transform's `mapAttrs`, a block loader's `attrs`, and `ResponsiveStyleSlot` / `VisibilityFlags`. A node built from a `Record<string, unknown>` no longer assigns, and an entry added to `BlockTypeRegistry` has to be spelled as a `type` over an object literal — TypeScript withholds the implicit index signature an `interface` would need.

  What a block's `render` receives is deliberately _not_ JSON and is now named and exported: `MaterializedAttrs` is the stored bag with each slot key replaced by the component that renders that slot's children. `BlockNodeRenderProps`, `BlockNodeComponent` and `BlockSpec` default their `Attrs` parameter to it.

  **Source-breaking for the editor's plugin-field seam.** `@plumix/admin-editor`'s `PluginFieldControlProps` now types `rhf.onChange` as `(next: JsonValue) => void` and the sibling block `attrs` as a `JsonObject`; `rhf.value` stays `unknown`, because the same controls also serve metaboxes, where RHF hands over a live `Date` for a temporal field. The `registerPluginFieldType` registry contract itself is unchanged.

  `@plumix/plugin-audit-log` holds a caller's own `properties` to JSON: `ctx.audit.log({ properties })` and an event definition's `extra` return no longer accept a `Date`, which reached storage as an ISO string anyway. The row's stored envelope stays open — its diff half is built from live entity columns.

  Island props keep their open type — the prop codec encodes `Date`, `Map`, `Set`, `BigInt`, `URL` and the typed arrays so they survive hydration, which a JSON type would deny.

  `@plumix/runtime-cloudflare` types the CF Access JWT payload as jose's `JWTPayload` instead of a loose dictionary.

- [#1894](https://github.com/withplumix/plumix/pull/1894) [`b39380a`](https://github.com/withplumix/plumix/commit/b39380a7dab2780ec1f36729328258b529b85800) Thanks [@nasyrov](https://github.com/nasyrov)! - Types the returns that were left `unknown`. A function declaring a return type of `unknown` — or a
  promise of one — is now rejected in production source by `plumix/no-unknown-return`, and the
  signatures it found say what they hand back.

  **Source-breaking for plugin authors** on the type level. Three sites also emit different JS, each
  noted below.

  - The `.sanitize()` callback on the `json()` and `entry()`/`term()`/`user()` reference builders, on
    `media()`, and on a hand-written `MetaBoxField` object returns `JsonValue`. The value is written
    to a JSON column, so this is what the write path already required — a callback returning a `Date`
    reached the driver as whatever `JSON.stringify` made of it. The typed builders (string, color,
    link, number, range, select, temporal, toggle) still take
    `(value: NonNullable<V>) => NonNullable<V>` and are unaffected for callers.
  - `LinkValue` is a `type` alias rather than an `interface`, so a link value assigns to `JsonObject`
    (TypeScript withholds the implicit index signature from an interface).
  - A telemetry record's `data` is `JsonValue`, and `TelemetryCollector.record` takes
    `JsonValue | (() => JsonValue)` — matching `TelemetrySpanHandle.set`, which already did. The
    debug bar still sanitizes at read time, since nothing checks the type at runtime.
  - The read-error mappers (`toRpcEntryReadError`, `toRpcTermReadError`) return `Error | undefined`
    instead of passing a foreign error through: `undefined` means "not mine to translate", and the
    caller rethrows what it caught. This removes a latent `throw undefined` on an unrecognized error
    code.

  One further behaviour change, in a forgiving-read fallback: a meta value stored as an object or
  array under a field since narrowed to `string` now reads back as its JSON rather than as
  `"[object Object]"` or `"a,b"`.

## 0.1.1

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
