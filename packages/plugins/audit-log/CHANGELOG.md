# @plumix/plugin-audit-log

## 0.2.0

### Minor Changes

- [#2378](https://github.com/withplumix/plumix/pull/2378) [`2ed420d`](https://github.com/withplumix/plumix/commit/2ed420d530838e9daccf049f02076d6d3d89b965) Thanks [@nasyrov](https://github.com/nasyrov)! - Fixes `ctx.audit.log()` recording nothing from an authenticated RPC procedure or route. The extension read the signed-in user off the request's ambient context, which is built before authentication; the procedure's own context, the one carrying the user, never reached it, so every row was dropped.

  **Breaking:** `log()` now takes the caller's context first — `ctx.audit?.log(ctx, { event, subject })` — and that context must be an `AuthenticatedAppContext`, which an authenticated procedure or route already holds. A hook listener gets a plain `AppContext`, so it checks `ctx.user` and passes `{ ...ctx, user: ctx.user }`. The runtime debug-and-drop for a missing user is gone; the compiler rejects the call instead.

- [#2385](https://github.com/withplumix/plumix/pull/2385) [`162009b`](https://github.com/withplumix/plumix/commit/162009b201c8926e71965d050a390d645878daac) Thanks [@nasyrov](https://github.com/nasyrov)! - Fixes a custom audit-log storage's tables never reaching `plumix migrate generate`. The plugin forwarded the storage's drizzle module to runtime queries but always named the default `@plumix/plugin-audit-log/schema` for codegen, so a storage with its own tables got no migration, and an external sink with none still emitted `audit_log`.

  **Breaking:** `AuditLogStorage.schemaModule` is replaced by `schema?: { module, specifier }`, the drizzle module and the specifier codegen imports declared together: `schemaModule: mod` becomes `schema: { module: mod, specifier: "<package>/schema" }`. A storage with no tables omits it and contributes no table. A site whose custom storage left `schemaModule` unset already has `audit_log` from earlier generates, so its next `plumix migrate generate` drops that table: to keep the rows, declare `schema: { module, specifier: "@plumix/plugin-audit-log/schema" }`, and read the generated migration before applying it.

### Patch Changes

- [#2410](https://github.com/withplumix/plumix/pull/2410) [`f3b88c4`](https://github.com/withplumix/plumix/commit/f3b88c413ba76181ff2e8d2f63647c551e0022f6) Thanks [@nasyrov](https://github.com/nasyrov)! - Fixes the `auditLog.list` procedure returning `occurredAt` as a `Date` while the admin read it as an ISO string; the procedure now serializes it to an ISO string, the way the comments plugin's queue rows already do.

- [#2347](https://github.com/withplumix/plumix/pull/2347) [`61efc2e`](https://github.com/withplumix/plumix/commit/61efc2ee7b57b53f3342a1f5652d68ad08e85ad7) Thanks [@nasyrov](https://github.com/nasyrov)! - Fixes published type declarations that imported `@plumix/core` or `@plumix/blocks`, packages a consumer does not depend on, so the affected types resolved to nothing. `pages`, `fileBlock` and `imageBlock` now name their types through `plumix/plugin` and `plumix/blocks`, and the RPC routers of audit-log, comments, forms, og and seo name the default database schema as `CoreSchema` from `plumix` instead of through `@plumix/core/schema`.

- [#2374](https://github.com/withplumix/plumix/pull/2374) [`ae40bd7`](https://github.com/withplumix/plumix/commit/ae40bd73a6b738092cb4fc1a48eb1b07bbe12b96) Thanks [@nasyrov](https://github.com/nasyrov)! - Fixes `pnpm i18n:extract` destroying `locales/*.po` — it now routes through `plumix i18n extract`, which refuses to run against this package's hand-authored catalog instead of silently rewriting it.

- [#2342](https://github.com/withplumix/plumix/pull/2342) [`dc4430c`](https://github.com/withplumix/plumix/commit/dc4430c704e1b5ba84432db54d89b6c9e9033fd4) Thanks [@nasyrov](https://github.com/nasyrov)! - Reads the request context from the lifecycle action a handler receives rather than from the ambient request store. `comment:created`, `comment:approved`, `comment:spam` and `comment:trashed` now hand their handlers the `AppContext` last as well, so code that fires them itself must pass it.

  Fixes the audit log recording no actor for entry, term, user and settings changes made through an authenticated RPC: the ambient context is built before the request is signed in, so the listener now attributes each row to the user the procedure ran as.

- [#2410](https://github.com/withplumix/plumix/pull/2410) [`f3b88c4`](https://github.com/withplumix/plumix/commit/f3b88c413ba76181ff2e8d2f63647c551e0022f6) Thanks [@nasyrov](https://github.com/nasyrov)! - Types `createPluginRpcClient` by the plugin's router: `createPluginRpcClient<typeof router>("menu")` now returns a client with one function per procedure, nested the way the router is (`rpc.locations.list()`), with inputs and outputs inferred from the server's handlers. `PluginRpcClient`, `PluginRpcInputs`, `PluginRpcOutputs` and `PluginRpcRouter`, on `plumix/admin`, name the router, the client and its procedure types. The untyped `rpc.call<T>("procedure", input)` form is gone: import the router type from the plugin's server module with `import type` and pass it as the type argument. The first-party plugins call through the typed client and now require `plumix` 0.23.0 or later.

## 0.1.5

### Patch Changes

- [#2253](https://github.com/withplumix/plumix/pull/2253) [`4560fad`](https://github.com/withplumix/plumix/commit/4560fad423d2372d4cf11fa3335173143b59bbba) Thanks [@nasyrov](https://github.com/nasyrov)! - Fire scheduled tasks on a Node deploy, and settle on one cron dialect

  A Node deploy now runs its own scheduled tasks. The schedules come from
  `app.scheduledTasks`, so they follow the plugins a site installs rather than a
  list kept in the runtime, and the process wakes on each UTC minute to fire the
  ones due. It is on by default; `node({ cron: false })` hands the schedules to an
  external scheduler instead, and `plumix cron list` / `plumix cron run "<expr>"`
  are there to drive them.

  Two runs of a task never overlap. Firings are serialised inside the process, and
  across processes a claim row and a lease row in the site's own database mean
  replicas sharing one database contend there — so exactly one of them runs each
  firing.

  **Breaking:** a cron expression must now be one every runtime reads the same
  way, and `buildApp` rejects one that is not, naming the task. `buildApp` runs at
  boot on every runtime, so an expression that comes from an environment variable
  passes the build and fails when the site starts — on Cloudflare that is a throw
  on every request, not just a dead task. Check your schedules before upgrading.

  What is now rejected:

  - **A numeric day-of-week.** Cloudflare reads that field as `1-7` with `1` =
    Sunday, Unix cron as `0-6` with `0` = Sunday, so `0 0 * * 1` meant Sunday on
    one and Monday on the other. Write the day by name — `SUN`, `MON`, … — and
    the error names both readings rather than guessing which you meant.
  - **The Quartz extensions `L`, `W` and `#`**, which Cloudflare accepted and no
    other runtime does.
  - **The `@daily` / `@hourly` / `@weekly` / `@midnight` shorthands**, and
    six-field expressions carrying a seconds column. Write the five-field form.
  - **A range that wraps the week**, such as `SAT-SUN`. Write it as a list:
    `SAT,SUN`.

  Everything else is unchanged: `*`, lists, ranges and steps in every field, and
  numeric months. A site using only those needs no edit.

## 0.1.4

### Patch Changes

- [#2175](https://github.com/withplumix/plumix/pull/2175) [`acbcae6`](https://github.com/withplumix/plumix/commit/acbcae699c69c1e90c281265728efc6a8d69687b) Thanks [@nasyrov](https://github.com/nasyrov)! - Removes the last single-runtime leanings that don't depend on the new handler
  contract. The audit-log cursor now encodes with Web APIs instead of Node's
  `Buffer`; core's dead, unused `node:fs` catalog loader is gone; the
  undeclared-binding dev-error hint is registered by `@plumix/runtime-cloudflare`
  instead of core, so it no longer appears on non-Cloudflare deploys; and
  scheduled-task cron docstrings describe the runtime as responsible for firing
  the schedule instead of naming `wrangler` configuration.

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
