# @plumix/plugin-comments

## 0.2.0

### Minor Changes

- [#2091](https://github.com/withplumix/plumix/pull/2091) [`d01e082`](https://github.com/withplumix/plumix/commit/d01e082f096665ff3327206e25ac046db9de2b32) Thanks [@nasyrov](https://github.com/nasyrov)! - Accepts a comment posted as a plain HTML form, and ships the markup that makes that worth having.

  `POST /_plumix/comments/submit` is now a `formPost` route, so a `<form method="post">` reaches it
  without the `X-Plumix-Request` header a browser cannot set on an ordinary submit. It reads
  urlencoded bodies as well as JSON, coercing `entryId` and `parentId` before validation while
  keeping the schema strict on both paths, and chooses the answer's shape from the request's
  content-type rather than from `Accept` — a `fetch` sends no `Accept` header of its own, so
  negotiating on it would have turned every existing scripted caller's 200 into a redirect. An
  accepted comment answers 303 back to the page the form was on, resolved from a hidden `returnTo`
  field first and the `Referer` second, both held to the site's own origin and refused the endpoint's
  own path. Every answer is `no-store`.

  Two new subpaths render the form. `PlumixCommentForm` from `@plumix/plugin-comments/theme` is the
  plugin's own markup — labelled controls, an error summary, the honeypot — dropped into a template,
  upgraded in place by an island where JavaScript runs. `usePlumixCommentForm` from
  `@plumix/plugin-comments/hooks` is the same submission with none of the markup, for a theme writing
  its own controls. `loadThread` and a hand-written form are unaffected.

  Owning the markup is what lets a refused comment be answered with the form back, carrying what the
  visitor typed and the refusal against the field that produced it. Every exit of the handler now
  goes through one negotiated `accepted` or `fail`, the honeypot's fake success included — answering
  a trapped submission differently from a real one is how a bot learns it was caught.

  One behaviour to know about: a request admitted by the `formPost` exemption is handed an
  authenticator that resolves nobody, so a signed-in author posting without JavaScript is filed as
  the anonymous commenter they cannot be told apart from. Under the default `first_time` mode that
  costs them their first comment's fast path and its `authorUserId` link, and only their first. The
  plugin's new documentation page says so.

### Patch Changes

- [#2062](https://github.com/withplumix/plumix/pull/2062) [`7b36faf`](https://github.com/withplumix/plumix/commit/7b36faf5b7a0a0bcc9f5db8a244464975a5ecd42) Thanks [@nasyrov](https://github.com/nasyrov)! - Adds `readVisitorMeta` to `plumix/db`: a request in, a salted per-install hash of the visitor's
  address and their truncated user-agent out. It is what a public submission handler needs to
  rate-limit or attribute without keeping the address itself, and `@plumix/plugin-comments` and
  `@plumix/plugin-forms` had each grown their own copy of it — the same hex encoder, the same lazily
  minted settings-row salt, the same `cf-connecting-ip` → `x-forwarded-for` → `"unknown"` ladder.

  The salt is minted on first use and persisted in the settings table, so an install needs no env var
  or KV binding to store hashed addresses; concurrent first-writes converge on one salt through
  `onConflictDoNothing` and a re-read. It takes the caller's namespace and keeps that namespace's salt
  in its own group, so no two callers share one — either's hashes would otherwise be matchable against
  the other's.

  To be clear about what the salt buys: it defeats a precomputed table of the IPv4 space and nothing
  more. It lives in the same database as the hashes, so it is no defence against someone who has
  already read that database.

  Also closes the hole that made keeping the salt off a settings _page_ meaningless. `settings.get`
  took any group name it was handed, so both plugins' salts were readable by anyone holding
  `settings:manage` — which is admin-wide, and mintable as a narrow API-token scope that has no
  business seeing them. A settings group whose name ends in `_internal` now means server-only rows:
  `settings.get` and `settings.upsert` refuse it, and `registerSettingsGroup` rejects the name at boot
  rather than letting a plugin build a settings page that fails on every load. Server-side readers are
  unchanged — this defends against a `settings:manage` holder, not against code running in the worker.

- [#2095](https://github.com/withplumix/plumix/pull/2095) [`8bdb8a3`](https://github.com/withplumix/plumix/commit/8bdb8a34dd366975b3e3bf967e0a3fbf63249381) Thanks [@nasyrov](https://github.com/nasyrov)! - Publishes the five helpers the forms and comments plugins had each written for themselves, and
  fixes a return-URL bug in `@plumix/plugin-forms` on the way.

  Each of the five was a fact about core's own wire format — the header its CSRF gate reads, the
  marker its islands bootstrap writes, the origin rule its dispatcher enforces — that a plugin had to
  rediscover. Core is now the one that says them.

  `resolveReturnUrl` on `plumix` resolves where to send a visitor after a form post the browser
  submitted, holding every candidate to an origin the site answers on and refusing the endpoint's own
  path, so the answer can be turned into neither an open redirect nor a loop.

  `useIsLive`, `documentBasePath` and `VISUALLY_HIDDEN_STYLE` join `plumix/blocks/renderer`.
  `useIsLive` is false through the server render and the first client render and true once a
  component is live, which is how progressive enhancement tells markup that shipped from JavaScript
  that ran. `documentBasePath` reads the subdirectory prefix off the islands bootstrap marker, for
  the callers `useBasePath` cannot serve because a hydrated island has no `PlumixProvider` context.
  `VISUALLY_HIDDEN_STYLE` is the `.sr-only` recipe inline, so hiding never depends on a stylesheet
  the page did not load.

  `CSRF_HEADER_NAME` and `CSRF_HEADER_VALUE` are now on `plumix/blocks`, alongside the existing
  export from `plumix`. They are defined in `@plumix/blocks` and re-exported by core rather than the
  reverse: the senders are islands, and a `"use client"` module reaching for `plumix` to name the
  header would pull the database, the authenticator and the dispatcher into a browser bundle.

  The forms fix: its own copy of the return-URL resolver parsed each candidate with no base and
  accepted only the configured origin. A relative `returnTo` — the natural thing for a template to
  pass — was refused outright rather than read as a path on the site, and on a multi-host deploy
  every candidate failed the origin test, so every submitter was sent to the site root. The shared
  resolver accepts both the request's origin and the configured one, which is the pair the
  dispatcher's own Origin check accepts.

  No public API was removed from either plugin; the copies were internal.

## 0.1.5

### Patch Changes

- [#2009](https://github.com/withplumix/plumix/pull/2009) [`17fa3cc`](https://github.com/withplumix/plumix/commit/17fa3cc4c852a6590bd72696cf535b76adbf4344) Thanks [@nasyrov](https://github.com/nasyrov)! - Ships each plugin's compiled Lingui catalogs in the published tarball. Every one
  of these plugins declares an `i18n` slot pointing at `./locales`, which the
  plumix Vite plugin copies out of the installed package at build time — but
  `package.json#files` allowlisted only `dist`, so the directory was absent from
  the tarball and a site installing the plugin from npm failed `plumix build` with
  `adminAssetNotFound`. Inside this repo a plugin resolves to a symlinked source
  tree, where the catalogs are always present, which is why nothing caught it.

## 0.1.4

### Patch Changes

- [#1897](https://github.com/withplumix/plumix/pull/1897) [`5fbb8cf`](https://github.com/withplumix/plumix/commit/5fbb8cf6faa061554f32c4f3ca490be03449a3d4) Thanks [@nasyrov](https://github.com/nasyrov)! - Types the stored block tree and the plugin dictionaries that describe serialized data with the public `JsonObject` / `JsonValue` types.

  **Source-breaking for block and theme authors** on the type level only — the emitted JS is unchanged. `BlockNode` is now a `type` alias rather than an `interface`, and its `attrs` is a `JsonObject`; the same goes for `BlockVariation.attrs`, `BlockSpec.defaults`, a transform's `mapAttrs`, a block loader's `attrs`, and `ResponsiveStyleSlot` / `VisibilityFlags`. A node built from a `Record<string, unknown>` no longer assigns, and an entry added to `BlockTypeRegistry` has to be spelled as a `type` over an object literal — TypeScript withholds the implicit index signature an `interface` would need.

  What a block's `render` receives is deliberately _not_ JSON and is now named and exported: `MaterializedAttrs` is the stored bag with each slot key replaced by the component that renders that slot's children. `BlockNodeRenderProps`, `BlockNodeComponent` and `BlockSpec` default their `Attrs` parameter to it.

  **Source-breaking for the editor's plugin-field seam.** `@plumix/admin-editor`'s `PluginFieldControlProps` now types `rhf.onChange` as `(next: JsonValue) => void` and the sibling block `attrs` as a `JsonObject`; `rhf.value` stays `unknown`, because the same controls also serve metaboxes, where RHF hands over a live `Date` for a temporal field. The `registerPluginFieldType` registry contract itself is unchanged.

  `@plumix/plugin-audit-log` holds a caller's own `properties` to JSON: `ctx.audit.log({ properties })` and an event definition's `extra` return no longer accept a `Date`, which reached storage as an ISO string anyway. The row's stored envelope stays open — its diff half is built from live entity columns.

  Island props keep their open type — the prop codec encodes `Date`, `Map`, `Set`, `BigInt`, `URL` and the typed arrays so they survive hydration, which a JSON type would deny.

  `@plumix/runtime-cloudflare` types the CF Access JWT payload as jose's `JWTPayload` instead of a loose dictionary.

## 0.1.3

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

## 0.1.2

### Patch Changes

- [#1520](https://github.com/withplumix/plumix/pull/1520) [`902a922`](https://github.com/withplumix/plumix/commit/902a922b8dc5652700cc9cbbb8f00726b34a482c) Thanks [@nasyrov](https://github.com/nasyrov)! - Repeated reads dedupe within a request through a new request-scoped read-through memo on `ctx` (`ctx.memo`, plus a `memoBatch` helper for per-id memoization over one batched query). The hot single-row lookups now read through it inside the existing service functions: the `site` settings group (head defaults, SEO surfaces, and the settings template dep share one query), author rows in `buildResolvedEntries`, the entry-type probe (new shared `readEntryType`, deduping the comments template dep against the blog related-posts loader), and the menu query cluster (shared between the `menus` template dep and `getMenuForLocation`, which now rides `ctx.memo` instead of a bespoke WeakMap). `plumix/test` gains `createTracedContext` and `createRequestMemo` for query-count assertions and `AppContext` stand-ins.

## 0.1.1

### Patch Changes

- [#1319](https://github.com/withplumix/plumix/pull/1319) [`843a184`](https://github.com/withplumix/plumix/commit/843a184ea755722f5b9d83664574eaf6ada97045) Thanks [@nasyrov](https://github.com/nasyrov)! - Bump runtime dependencies: radix-ui, lucide-react, and valibot (admin UI and validation), and markdown-it (comment rendering).

- Updated dependencies []:
  - plumix@0.1.1
