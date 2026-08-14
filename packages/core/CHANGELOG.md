# @plumix/core

## 0.13.0

### Minor Changes

- [#1749](https://github.com/withplumix/plumix/pull/1749) [`f3971a8`](https://github.com/withplumix/plumix/commit/f3971a8ec726a12ab7aa2e0c2897d48f3d5c4889) Thanks [@nasyrov](https://github.com/nasyrov)! - Add access policies and a hard gate for theme-facing routes.

  Declare who may see a route or entry type as a resolver over the current
  visitor that returns a discrete outcome — a segment plus a gate decision. The
  framework enforces it: an anonymous visitor to an authenticated-only page is
  redirected to sign in (and returned afterwards), and an under-privileged visitor
  to a role-gated page is denied.

  ```ts
  import { challenge, definePolicy, grant, redirectToLogin } from "plumix";

  const membersOnly = definePolicy({
    segments: ["members"],
    resolve: (ctx) =>
      !ctx.user
        ? redirectToLogin()
        : !hasActiveSub(ctx.user)
          ? challenge("subscribe")
          : grant("members"),
  });
  ```

  Attach a policy at the entry-type level (`access.default`, gating a type's
  single and archive routes) or on a custom archive; the built-in
  `anonymousPolicy` / `authenticatedPolicy` / `rolePolicy` cover the common cases.
  The decision logic is unconstrained (role, a `meta` flag, an external check),
  but the return shape is closed, so the gate stays sound. `auth({ loginPath })`
  points sign-in at a theme-owned page.

  Un-policied routes are unchanged. A policied page renders live in this release;
  keying the edge cache on the segment is a follow-up.

- [#1756](https://github.com/withplumix/plumix/pull/1756) [`6d6db5c`](https://github.com/withplumix/plumix/commit/6d6db5c6a2defabfc0737f570f4d30a40c7ee67d) Thanks [@nasyrov](https://github.com/nasyrov)! - Derive the built-in field-type vocabulary from one runtime roster.

  The set of built-in meta-box `inputType` names now has a single source — a
  per-family roster (`STRING_INPUT_TYPES`, `TEMPORAL_INPUT_TYPES`,
  `SCALAR_INPUT_TYPES`, `REFERENCE_INPUT_TYPES`, `CHOICE_INPUT_TYPES`,
  `STRUCTURAL_INPUT_TYPES`, `LEGACY_INPUT_TYPES`, and the derived
  `CANONICAL_INPUT_TYPES`) exported from `@plumix/core/fields`. The string and
  temporal input-type unions derive from these arrays, and a compile-time
  exhaustiveness guard — enabled by splitting `MetaBoxField` into the newly
  exported `CanonicalMetaBoxField` and the legacy catch-all — binds the roster
  to the union, so the two can no longer drift. The admin's reserved-name set
  and its unknown-type warning now derive from the roster instead of hand-synced
  copies.

  The only consumer-visible behaviour change: the built-in `group` and `link`
  field types are now **reserved**, so a plugin can no longer register a custom
  field type under those names and shadow the host control (they previously
  slipped through the hand-maintained set). `media` / `mediaList` remain
  unreserved — they are plugin-contributed reference kinds whose own admin
  renderers register through the same seam.

- [#1744](https://github.com/withplumix/plumix/pull/1744) [`4f5730d`](https://github.com/withplumix/plumix/commit/4f5730dcaecb587396c41f7c10229f3689de52c8) Thanks [@nasyrov](https://github.com/nasyrov)! - Add an opt-in `auth({ selfSignup: { defaultRole } })` switch that opens public
  registration.

  Self-service signup was gated to the `allowed_domains` allowlist, so "anyone can
  register as a subscriber" meant re-implementing the flow from primitives. With
  `selfSignup` set, a first-time verified email through the built-in magic-link or
  OAuth flows provisions a new user at `defaultRole` regardless of
  `allowed_domains`:

  ```ts
  auth({ passkey, magicLink, selfSignup: { defaultRole: "subscriber" } });
  ```

  Omit it (the default) and signup stays domain-gated exactly as before. The
  bootstrap rail is unchanged — the first admin still enrols via passkey (or
  `bootstrapVia: "first-method-wins"`), and self-signup never mints the first user
  on an empty deploy.

  Because enabling this turns the magic-link request endpoint into a public signup
  surface, issuance is now rate-limited: at most five magic-link tokens per email
  within a 15-minute window. Over the cap the request is a silent no-op, so the
  endpoint stays timing- and shape-uniform for registered vs unregistered emails
  and can't be turned into an email-bomb amplifier or an enumeration probe.

- [#1755](https://github.com/withplumix/plumix/pull/1755) [`dcda2fa`](https://github.com/withplumix/plumix/commit/dcda2fa124117175f5a56f587c22e95d6f14d89e) Thanks [@nasyrov](https://github.com/nasyrov)! - Let editors set per-entry visibility, choosing from the policies a type declares.

  An entry type can offer a closed set of selectable access policies beside its
  default, and an editor assigns one to an individual entry from the document
  settings — no code change per entry. Precedence is per-entry › entry-type ›
  global, so a single article can be members-only even when its type is public.

  ```ts
  ctx.registerEntryType("article", {
    access: {
      default: anonymousPolicy, // public by default…
      policies: [
        // …but an editor may lock an individual entry to members.
        { key: "members", label: "Members only", policy: authenticatedPolicy },
      ],
    },
  });
  ```

  The choice persists on the entry and drives both the hard gate and the segment
  the edge cache keys on. An editor can only pick a policy the developer declared
  (`entry.update` validates the key server-side), and a type that declares no
  selectable policies pays no extra lookup — the hot path is unchanged. A
  would-be-404 falls back to the type default, so gating never leaks which slugs
  exist, and a stale selection (a policy the developer removed) falls back to the
  default rather than granting less.

  This completes the theme-facing access-control model: policies now attach at the
  global, entry-type, and per-entry levels.

- [#1750](https://github.com/withplumix/plumix/pull/1750) [`202a1fc`](https://github.com/withplumix/plumix/commit/202a1fc788e5386c08ba6c9d69bbba49c3503fc6) Thanks [@nasyrov](https://github.com/nasyrov)! - Key the edge cache on the access-policy segment, so signed-in visitors share
  cached renders instead of each bypassing the cache.

  A policied route resolves to a discrete segment (`anonymous`, `authenticated`,
  `role:<role>`, or a developer's `entitlement:<label>`); that segment now
  participates in the cache key. Two visitors in the same non-private segment whose
  render is byte-identical share one edge entry — the "subscribers-only" page is
  cached once per segment at its real URL instead of rendering live for every
  logged-in request. The cache-tag vocabulary (`t:` / `e:`) is unchanged, so one
  publish of an entry still purges every segment variant at once.

  ```ts
  // Shared-cacheable for all logged-in visitors — the explicit opt-in.
  ctx.registerEntryType("article", {
    access: { default: authenticatedPolicy },
  });

  // Gated but never shared-cached — the escape hatch for a personalized page.
  definePolicy({
    resolve: (c) => (c.user ? grant("private") : redirectToLogin()),
  });
  ```

  A new built-in `private` segment is the escape hatch: its render is per-visitor
  and never read from or written to the shared cache. Un-policied pages are
  unchanged — an anonymous request caches under the plain URL exactly as before,
  and a request carrying a session (or an `Authorization`/`?preview=` grant) stays
  private. Nothing is inferred; cache behavior follows only the declared policy.

### Patch Changes

- Updated dependencies [[`c01d2a3`](https://github.com/withplumix/plumix/commit/c01d2a3f843cdf743ba2f4cc5812c245cb9d918d)]:
  - @plumix/blocks@0.13.0

## 0.12.0

### Minor Changes

- [#1729](https://github.com/withplumix/plumix/pull/1729) [`665a57b`](https://github.com/withplumix/plumix/commit/665a57b421fc2f82dcf0dad7d0a89e2497557959) Thanks [@nasyrov](https://github.com/nasyrov)! - Let custom archives opt into the edge cache and contribute cache tags.

  `registerArchiveType` now accepts a `cacheable` flag, and a custom-archive resolver's
  `CustomArchiveResolution` may return `tags`. When `cacheable` is set, a `custom`
  route's anonymous GET renders participate in the built-in edge cache instead of
  rendering live on every request, and the resolver's `tags` are stored on the response
  so a publish of the listed types purges the archive — the same coarse, publish-driven
  invalidation the built-in entry, taxonomy, and front-page archives already get.
  Previously `custom` intents bypassed the Workers Cache API entirely and carried no
  tags, so faceted or rollup archives that the built-in taxonomy archive can't express
  lost edge caching and tag-based purge.

  The two knobs are split deliberately: the cache gate runs before render, so the opt-in
  (`cacheable`) must be static, while `tags` are consumed only at store time and ride on
  the resolution. Both default off and no-op safely on their own — `tags` without
  `cacheable` never caches; `cacheable` without `tags` caches under `s-maxage` alone.
  Tags flow through the existing embedded-reference tag accumulator, and the pure cache
  decision layer stays free of the archive-type registry lookup.

- [#1712](https://github.com/withplumix/plumix/pull/1712) [`c74ca2f`](https://github.com/withplumix/plumix/commit/c74ca2ffc069209d543e5d606a2ded8b22245a1e) Thanks [@nasyrov](https://github.com/nasyrov)! - Let custom archives contribute a sitemap scope, and give `seo:sitemap:urls` the request context.

  `registerArchiveType` now accepts a `sitemap` provider (`{ count, urls }`), mirroring
  its existing `feed` option. Core folds the archive's URL space into the native
  sitemap index under a paginated `/sitemap-<name>-<page>.xml` scope: `count(ctx)`
  drives index pagination (kept cheap — no URL scan), and `urls(ctx, page)` produces
  each 1000-URL page. Previously a custom archive was neither an entry type nor a
  taxonomy, so its URLs were absent from sitemaps entirely.

  The `seo:sitemap:urls` filter now also receives the 1-based `page` and the request
  `ctx` — `(urls, scope, page, ctx)`. A subscriber can now query the DB to inject
  rows and paginate its adjustments, not just reshape statically-known URLs. The new
  arguments are appended, so existing `(urls, scope)` subscribers are unaffected.

- [#1680](https://github.com/withplumix/plumix/pull/1680) [`b124789`](https://github.com/withplumix/plumix/commit/b1247897f2044ad4e7f975ce2d0b8294fd0939af) Thanks [@nasyrov](https://github.com/nasyrov)! - Install the dev-only client error tools from one core-owned entry point.

  The island error dialog, the browser-errors-to-terminal forwarder, and the
  compile/import error overlay are now installed from a single browser-safe
  `@plumix/core/dev-client` export (reached through the `plumix` package as
  `plumix/core/dev-client`), which the generated client bootstrap calls behind the
  `import.meta.hot` dev gate. `@plumix/blocks`'s island runtime no longer installs
  any overlay or forwarder — it only hydrates islands and dispatches the
  `plumix:island-*` events the core-installed dialog listens for. The dependency
  runs core → blocks (no cycle), and nothing in `@plumix/blocks` outside its
  `dev-error/` implementation imports dev-error.

  This is behind the existing `PLUMIX_DEV` / `import.meta.hot` gates, so it
  tree-shakes out of production exactly as before: an island hydration mismatch
  still shows the dialog, a Vite compile error still shows the overlay, and client
  errors still forward to the terminal — now all wired from one place.

  The `plumix/blocks/dev-error` subpath — an internal wiring seam the generated
  client bootstrap used to reach the compile overlay — is removed, since install
  now goes through `plumix/core/dev-client`. The dev-error implementations
  themselves remain in `@plumix/blocks` and are unaffected.

- [#1706](https://github.com/withplumix/plumix/pull/1706) [`6da618c`](https://github.com/withplumix/plumix/commit/6da618c216924fa966cb735ef33c16451383b4b0) Thanks [@nasyrov](https://github.com/nasyrov)! - Add a `plumix/db` (`@plumix/core/db`) subpath and complete the direct-write toolkit.

  A plugin running a bulk-ingest pipeline writes directly to `ctx.db`, which
  bypasses core's entry-mutation service — so no `entry:*`/`term:*` action fires
  and core's edge-cache purge invalidator never runs, leaving the public archive
  and permalinks stale until TTL. Making that path first-class needed two things
  the public API didn't expose:

  - **The edge-cache tag vocabulary.** `typeTag`, `entryTag`, `entryPurgeTags`,
    `termPurgeTags`, and `enqueuePurgeTags` are now exported, so a direct-write
    plugin can enqueue the same coarse `t:<type>`/`e:<id>` tags core would —
    `enqueuePurgeTags(ctx, entryPurgeTags(type, id))` — for the post-request /
    scheduled flush, instead of hand-restating the scheme (PRD [#1080](https://github.com/withplumix/plumix/issues/1080)) and drifting
    when it changes.
  - **The Drizzle table-introspection helpers.** `getTableColumns`, `getTableName`,
    and `is` live on the `drizzle-orm` root rather than its `/sql` subpath, so they
    weren't reachable through core. `getTableColumns` in particular is how a bulk
    `onConflictDoUpdate` derives its set clause — without it a plugin had to add
    its own `drizzle-orm` dependency (which can drift from core's pinned version).

  The new `plumix/db` / `@plumix/core/db` subpath groups the whole toolkit — query
  operators, schema tables, introspection helpers, and the purge vocabulary — in
  one import so a direct-write plugin never needs its own `drizzle-orm`
  dependency. Everything is also reachable from the flat package root.

- [#1732](https://github.com/withplumix/plumix/pull/1732) [`05ea95c`](https://github.com/withplumix/plumix/commit/05ea95c65a798ea2b74b7b3f3f533471aa4a483e) Thanks [@nasyrov](https://github.com/nasyrov)! - Accept a set of passkey origins so custom domains and preview deploys can enrol.

  `auth.passkey` gains an optional `allowedOrigins` — extra origins the WebAuthn
  ceremony accepts alongside `origin`, each an exact origin
  (`https://www.example.com`) or a subdomain wildcard
  (`https://*.acme.workers.dev`). Every entry's host must be `rpId` or a subdomain
  of it (the registrable-suffix rule), validated at config time. `rpId` is still
  the sole anchor and is never derived from the request, so a policy can only
  _accept_ origins the operator declared — never widen the set from a
  request Host. Verification stays pinned to `origin` when `allowedOrigins` is
  unset, so existing single-host deploys are unchanged.

  `auth.passkey.origin` and `.allowedOrigins` also accept an `(env) => …`
  resolver (the same `EnvInput` form as secret slots), so the public origin can be
  sourced from a runtime env var (`PUBLIC_ORIGIN`) per deploy instead of hardcoded
  — resolved per request, consistent across runtimes rather than reconstructed
  from Cloudflare's build-time env. Literal values keep their config-time
  validation; resolver forms defer to runtime. The canonical `app.origin` (CSRF,
  magic-link, OAuth, sitemap, cron) resolves through the same value.

  `cloudflareDeployOrigin()` now anchors `rpId` to the account registrable domain
  (`<account>.workers.dev`) and returns `allowedOrigins:
["https://*.<account>.workers.dev"]`, so one passkey enrolled once is valid on
  production **and** every per-branch preview URL. It also accepts
  `productionOrigin` for deploys served on a custom domain, which Workers Builds
  cannot expose to the build.

  **Breaking (`@plumix/runtime-cloudflare`):** `cloudflareDeployOrigin()` no longer
  returns the full worker host as `rpId` — production now yields
  `rpId: "<account>.workers.dev"` instead of `rpId: "<worker>.<account>.workers.dev"`.
  Passkeys enrolled against the old per-worker `rpId` must be re-enrolled once
  after upgrading. A custom domain and `workers.dev` remain different registrable
  domains, so no single passkey spans both — authenticate custom-domain-production
  previews with an origin-agnostic method (magic-link / Cloudflare Access).

- [#1709](https://github.com/withplumix/plumix/pull/1709) [`66bce99`](https://github.com/withplumix/plumix/commit/66bce99343595168a13272b947cebb074aa30650) Thanks [@nasyrov](https://github.com/nasyrov)! - Add per-entity OpenGraph `og:image` from a featured media field.

  Theme and plugin authors can mark a media field `media("hero").featured()` (the
  entry's representative image) or `media("share").ogImage()` (an explicit
  social-share override). Public entry pages now emit a per-entity `og:image` —
  resolved as the `ogImage`-role field → the `featured`-role field → the existing
  site-wide `default_og_image` — and upgrade the Twitter card to
  `summary_large_image`, instead of only the single site default. The field name is
  free; the role is what core keys on, and it reads the hydrated media reference
  structurally so core takes no dependency on `@plumix/plugin-media`.

  `buildManifest` rejects an entry type with more than one `featured` field, and any
  role-tagged field that stores multiple values, so a per-entity `og:image` always
  resolves to one deterministic image. The Cloudflare edge SVG→PNG rasterization
  path and storage-backed serve route are tracked separately ([#1708](https://github.com/withplumix/plumix/issues/1708)).

- [#1728](https://github.com/withplumix/plumix/pull/1728) [`5785f19`](https://github.com/withplumix/plumix/commit/5785f19862495b1c445640fbc58a3210d6b0c2ff) Thanks [@nasyrov](https://github.com/nasyrov)! - Add a plugin/site/theme surface for public-route redirects (301/302/307/308) and `410 Gone`.

  Previously the only redirect the public pipeline emitted was the dispatcher's own
  canonical normalization, so a plugin could map a URL to content but never to a
  redirect or a 410. Migrating an existing site (legacy `path → path` moves, or
  turning a removed entry's URL into a redirect-to-successor / 410 instead of a soft 404) had to be punted to the CDN zone.

  Redirects are now a first-class part of the app, contributed through whichever
  surface owns the URL, all merged into one precedence-ordered set matched by the
  dispatcher **ahead of the content route map** (so a redirect shadows a would-be
  page):

  - **Site** — `config.redirects` on the plumix config, for the site's own cutover
    list.
  - **Plugin** — `ctx.registerRedirects([...])` in a plugin's setup, for
    feature-owned or data-driven redirects.
  - **Theme** — a declarative `redirects: [...]` field on the theme descriptor
    (themes have no setup hook), for URL-structure moves the theme owns.

  Each rule maps a `from` to a target, where `from` is a `URLPattern` string
  (`/team/:slug`, `/legacy/*`; use a `RegExp` for literal paths with URLPattern
  metacharacters), or a `RegExp` (with `$1` / `$<name>` backreferences interpolated
  into `to`); `{ gone: true }` yields a 410. A rule may instead supply `match(url)`
  for a fully dynamic decision (e.g. a DB lookup). The request query string is
  carried onto the target by default (a `preserveQuery: false` per-rule flag opts
  out; a target that states its own `?…` is never appended to). Precedence is
  site → plugin → theme by default, and a per-rule `priority` overrides it (lower
  wins).

  The redirect stage runs after the reserved SEO asset routes (robots.txt,
  sitemaps, feeds) but ahead of the static-asset 404 shortcut and the content route
  map — so a moved image/css/js can redirect, and a redirect shadows a would-be
  content page. Only `GET`/`HEAD` public requests reach it.

  New public types: `RedirectRule`, `RedirectResolution`, `RedirectTarget`,
  `RedirectStatus`.

### Patch Changes

- [#1731](https://github.com/withplumix/plumix/pull/1731) [`c5facfe`](https://github.com/withplumix/plumix/commit/c5facfee050d3f5880de31dc6866dd48c4ac3d41) Thanks [@nasyrov](https://github.com/nasyrov)! - Standardize type augmentation on the single public `plumix` specifier.

  The augmentable registry docstrings (`EntryTypeRegistry`, `ArchiveTypeRegistry`,
  `TermTaxonomyRegistry`, `TemplateDepRegistry`, `ReferenceHydrationShapes`,
  `BlockTypeRegistry`, `PatternCategoryRegistry`) told consumers to
  `declare module "@plumix/core"`. That specifier is an internal package consumers
  don't depend on, so the augmentation silently no-op'd and `forEntryType("…")`
  still errored — the bug reported in [#1691](https://github.com/withplumix/plumix/issues/1691).

  Every registry is now augmented through one specifier, `declare module "plumix"`:

  ```ts
  declare module "plumix" {
    interface EntryTypeRegistry {
      insight: { entry: ResolvedEntry };
    }
  }
  ```

  `plumix` re-exports the block/pattern registries (`BlockTypeRegistry`,
  `PatternCategoryRegistry`, type-only) so the whole augment surface lives behind
  one module. Using one specifier matters: augmenting the same interface through
  two of them (e.g. `plumix` and `plumix/plugin`) fractures declaration merging —
  each view drops the other's keys. A `no-restricted-syntax` lint rule now forbids
  augmenting `@plumix/*` packages or `plumix/*` subpaths, steering everything to
  `plumix`. See `docs/type-augmentation.md`.

- [#1727](https://github.com/withplumix/plumix/pull/1727) [`30f287e`](https://github.com/withplumix/plumix/commit/30f287e72470efd50ce4e95183c4f7e89f8e0843) Thanks [@nasyrov](https://github.com/nasyrov)! - Stop the dev error page from scrolling sideways on wide SQL or header values.

  The context, plugin-panel, and executed-query lists on the `plumix dev` error
  page rendered as bare `display: grid`, so their implicit column sized to
  `max-content` — a long single-line `select … where (…)` query or a long
  `accept` / `user-agent` header grew it past the viewport, scrolling the whole
  page body sideways and clipping the content past each panel's right edge. Each
  grid now pins its column to `minmax(0, 1fr)` (matching the stack/source and
  hydration-diff grids), so wide content stays inside its own `overflow-x` / word
  wrap block: SQL rows scroll within their block and header values wrap.

- [#1705](https://github.com/withplumix/plumix/pull/1705) [`88b6db2`](https://github.com/withplumix/plumix/commit/88b6db2b94c94a0a9c12f4d8cb84289f28cd7558) Thanks [@nasyrov](https://github.com/nasyrov)! - Fix a flash of unstyled content (FOUC) on first paint in `plumix dev`.

  Theme stylesheets declared via `defineTheme({ css: ["./theme/app.css"] })` were
  delivered in dev only through the client-entry `<script>`, which side-effect-
  imports the CSS so Vite injects `<style>` tags after hydration — the page painted
  unstyled for a moment, then snapped in. The dev SSR response now also links each
  resolvable theme CSS path with a render-blocking `<link rel="stylesheet">` in
  `<head>`, so the first frame is styled, matching the production build.

  The client-entry `<script>` still loads, so CSS hot-module replacement is
  unchanged. Aliased (`~`, `@/`) and npm-scope (`@scope/pkg`) CSS specifiers keep
  riding in on that import, since a browser `<link>` cannot resolve them.

- Updated dependencies [[`b124789`](https://github.com/withplumix/plumix/commit/b1247897f2044ad4e7f975ce2d0b8294fd0939af), [`56e416a`](https://github.com/withplumix/plumix/commit/56e416af8e753cc07cd0f87a26af4ef0c6fc343c), [`fff6e4a`](https://github.com/withplumix/plumix/commit/fff6e4a134e03a6fa1276c8d0d3d23c8cd7e134a)]:
  - @plumix/blocks@0.12.0

## 0.11.0

### Patch Changes

- Updated dependencies [[`77ef988`](https://github.com/withplumix/plumix/commit/77ef988411eed32144bd4d5fabcc497fbbbac9ef), [`168466a`](https://github.com/withplumix/plumix/commit/168466a3e473a81ce77c0acff6678bbeac1dea9b)]:
  - @plumix/blocks@0.11.0

## 0.10.0

### Patch Changes

- Updated dependencies [[`5743bfc`](https://github.com/withplumix/plumix/commit/5743bfc95516d55c67d633f4b61a4c9a1e092f8d)]:
  - @plumix/blocks@0.10.0

## 0.9.0

### Minor Changes

- [#1645](https://github.com/withplumix/plumix/pull/1645) [`24d9639`](https://github.com/withplumix/plumix/commit/24d96390631893c788b54fe6261c781ad798969c) Thanks [@nasyrov](https://github.com/nasyrov)! - Add a dev-only request history to the debug bar so a developer can inspect
  requests that already finished — including RPC/REST/`/api` and 5xx responses
  that never get an inline bar.

  Every request the worker handles is captured, after the response, into a
  bounded in-memory ring as a serializable `DebugSnapshot` (span tree, telemetry
  records, and a small fixed projection of request context). Snapshots are
  detached to inert JSON at capture, so holding recent requests never pins the
  request graph, and oversized payloads are truncated to keep the footprint flat.

  The bar's panels now render purely from a `DebugSnapshot`, so a stored request
  replays identically to a live one and plugin panels support history for free.
  Dev-only read routes expose the history over HTTP — `GET
/_plumix/debug/requests` (newest-first metadata), `/<id>` (the snapshot JSON, a
  future MCP tool's canonical source), and `/<id>?format=html` (the same snapshot
  rendered to panel markup) — with the endpoint excluded from its own capture.

  The bar gains a request switcher: a `<select>` of the recent requests
  (method/path/status/duration, newest-first) with the current request
  pre-selected. The current request is still server-rendered inline on page load
  (no flash, zero-JS); selecting a past one is the bar's single client-JS
  concession — a minimal listen → fetch → swap that fails soft, so a history
  hiccup never breaks the host page. The whole subsystem — capture, store, routes,
  switcher, and script — is gated on the dev flag and tree-shaken from production
  builds.

- [#1649](https://github.com/withplumix/plumix/pull/1649) [`09e89b8`](https://github.com/withplumix/plumix/commit/09e89b88a7e8cbabe96baf7413c3c38149db905e) Thanks [@nasyrov](https://github.com/nasyrov)! - Let plugins contribute panels to the `plumix dev` error page.

  The dev error page already shows fixed request / route / database / timeline /
  application context below the stack. A plugin can now add its own section
  through a new dev-only `error_page:panels` filter, mirroring how it contributes
  to the debug bar via `debug_bar:panels`:

  ```ts
  "error_page:panels": (
    panels: readonly DevErrorPanel[],
    error: unknown,
    ctx: AppContext,
  ) => readonly DevErrorPanel[];
  ```

  Each `DevErrorPanel` is `{ id, title, order?, render }`, where `render(error,
ctx)` returns a `ReactNode` over the caught value and the live request context —
  the same pair the `error_page:hints` filter receives. Core collects the filter
  `applyFilterIsolated`-safe, dedupes by id (last wins), orders by ascending
  `order`, and renders each panel in its own isolated SSR pass, so a throwing
  subscriber or a panel that throws from `render` degrades to a notice rather than
  crashing the very page meant to surface the error. Contributed panels appear as
  their own sections below the built-in context.

  Core registers none of its own — its built-in sections cover the common case —
  so this filter is purely the plugin-facing panel API. The whole surface stays
  behind the `PLUMIX_DEV` gate and tree-shakes out of production builds.

- [#1651](https://github.com/withplumix/plumix/pull/1651) [`36ce243`](https://github.com/withplumix/plumix/commit/36ce24381eee89688b18cd77255bb9fb29429407) Thanks [@nasyrov](https://github.com/nasyrov)! - Adds an open-in-editor path remap for container and remote dev servers.

  The dev error page's "Open in editor" links use the file path as the dev server
  sees it, which doesn't exist on your machine when the server runs in a container,
  a devcontainer, or on a remote/SSH box. Set `PLUMIX_EDITOR_PATH_MAP` to a
  `from=>to` mapping (e.g. `/workspace=>/Users/me/proj`) and the on-server path
  prefix is rewritten to the editor-host path before each link is built, so the
  links open the right file. Only the path prefix is remapped, on a path boundary;
  paths outside it are left untouched. Like `PLUMIX_EDITOR`, it is read only in
  `plumix dev` and tree-shakes out of production builds.

- [#1650](https://github.com/withplumix/plumix/pull/1650) [`c16b2bc`](https://github.com/withplumix/plumix/commit/c16b2bcc112c82459a090a5e59fe263ee55ff658) Thanks [@nasyrov](https://github.com/nasyrov)! - Attach a correlation id to production 5xx responses so an operator can tie a
  user's report to a specific failure without exposing a stack.

  When a request throws at the dispatcher's public-render boundary in production,
  the themed `500` now carries the failing request's telemetry id as an
  `errorId`. It flows to the theme's error template via `ErrorData.errorId` and is
  printed on the built-in `500` page (`Reference ID: …`) when the theme ships no
  `500` template of its own. The id is the same value the telemetry envelope and
  structured `dispatch_failed` log already record, so quoting it maps straight to
  the request's snapshot and span — no new id is minted.

  Nothing about the production error path's isolation changes: `ErrorData` still
  exposes no `Error` field, and no stack, source, or exception message crosses the
  boundary. A `404` leaves `errorId` undefined; the dev error surface is
  unaffected.

### Patch Changes

- Updated dependencies [[`09e89b8`](https://github.com/withplumix/plumix/commit/09e89b88a7e8cbabe96baf7413c3c38149db905e), [`36ce243`](https://github.com/withplumix/plumix/commit/36ce24381eee89688b18cd77255bb9fb29429407), [`2d6753a`](https://github.com/withplumix/plumix/commit/2d6753a26e55df944bc194564190990db1b775ec), [`a9f5648`](https://github.com/withplumix/plumix/commit/a9f56484cb25875cd895538018139a706dc2ba80)]:
  - @plumix/blocks@0.9.0

## 0.8.0

### Minor Changes

- [#1609](https://github.com/withplumix/plumix/pull/1609) [`741c6b4`](https://github.com/withplumix/plumix/commit/741c6b4b0c731e3fe8efd1c316a0ea4fd23b6e0d) Thanks [@nasyrov](https://github.com/nasyrov)! - Show actionable "how to fix" hints on the `plumix dev` error page.

  When a recognized error reaches the dev error page, it now surfaces a prominent
  "how to fix" card above the stack. Core matches its own typed errors (e.g.
  `ThemeRegistrationError`) and a curated set of common untyped pitfalls — a D1
  `no such table` points at `plumix migrate`, a missing secret points at
  `.dev.vars`, a missing binding points at `wrangler.jsonc`. Unrecognized errors
  render no card.

  Hints are contributed through a new dev-only `error_page:hints` filter that
  mirrors `debug_bar:panels`: it runs on every dev 5xx with the caught error and
  request context, and plugins subscribe to add or override hints. The shared
  renderer at `@plumix/blocks/dev-error` gains the `DevErrorHint` shape and renders
  the cards. Everything stays gated on `process.env.PLUMIX_DEV` and tree-shakes out
  of production.

- [#1613](https://github.com/withplumix/plumix/pull/1613) [`ec117ea`](https://github.com/withplumix/plumix/commit/ec117ea45ed6ff064807ae2d6cee4dfb5b67cf35) Thanks [@nasyrov](https://github.com/nasyrov)! - Make a throwing block loader dev-fatal in `plumix dev`, naming the block.

  When a block's SSR loader rejects during development, the page now fails to the
  dev error page — naming the culprit block and surfacing the loader's own
  message and the failing query — instead of silently dropping that block from
  the render. In production the same rejection stays isolated to the block
  (degrading to its `errorFallback`, or nothing) and the page still renders, so
  the resilience contract is unchanged.

  The render path captures the first loader rejection and, behind the
  `process.env.PLUMIX_DEV` gate, throws a new `BlockLoaderError` (exported from
  `@plumix/blocks`) that propagates to the dispatcher catch. The wrapper names the
  block and loader key, carries the underlying message so error-page hints keep
  matching through the loader boundary, preserves the original via `cause`, and
  adopts its stack so frames resolve to the failure site. The gate tree-shakes the
  escalation out of production builds.

- [#1617](https://github.com/withplumix/plumix/pull/1617) [`9a1e88a`](https://github.com/withplumix/plumix/commit/9a1e88adb272f1f4795ddfd23e2958b4aa8b9443) Thanks [@nasyrov](https://github.com/nasyrov)! - Open a `plumix dev` error-page stack frame in your editor.

  Each frame on the dev error page now carries an "open in editor" link that jumps
  to the file at the offending line. It is a plain anchor to the editor's URL
  scheme — zero-JS, no server round-trip. The editor is chosen by a dev-only
  `PLUMIX_EDITOR` setting: a known-editor key (`vscode` — the default —
  `vscode-insiders`, `cursor`, `windsurf`, `zed`, `idea`, `phpstorm`, `webstorm`,
  `sublime`), a custom `{file}` / `{line}` / `{column}` format string for any other
  editor, or `off` / `none` to drop the link. Everything stays gated on
  `process.env.PLUMIX_DEV` and tree-shakes out of production.

- [#1606](https://github.com/withplumix/plumix/pull/1606) [`6fe5583`](https://github.com/withplumix/plumix/commit/6fe5583954947ba11093fb053c946640b703b4b0) Thanks [@nasyrov](https://github.com/nasyrov)! - Add a dev-only error page for render throws in `plumix dev`.

  When a theme template throws during render in development, the visitor now gets
  a self-contained, theme-independent 500 page showing the exception name,
  message, and raw stack — instead of re-rendering the failure through the theme
  (which blanks the screen when the theme itself is the culprit). The page is a
  shared, zero-JS renderer exposed at `@plumix/blocks/dev-error` and SSR'd by core
  at the dispatcher catch. It is gated on `process.env.PLUMIX_DEV`, so the page
  and its styles tree-shake out of production builds — the existing themed 500 is
  unchanged.

- [#1608](https://github.com/withplumix/plumix/pull/1608) [`3d269a3`](https://github.com/withplumix/plumix/commit/3d269a399f6e36e499ef60846abe02716103d7a0) Thanks [@nasyrov](https://github.com/nasyrov)! - Resolve dev error-page stack frames to original source with a code excerpt.

  The `plumix dev` error page now parses the (already-sourcemapped) stack into
  frames showing each original `file:line`, with application frames expanded and
  framework/vendor frames collapsed behind a toggle. Selecting a frame shows a
  source excerpt with the offending line highlighted — lazy-fetched from a new
  dev-only source resolver mounted as a Vite middleware, so the worker (which has
  no filesystem) never reads source itself. Paths are shown relative to the
  project root the frames imply. Everything stays gated on `process.env.PLUMIX_DEV`
  and tree-shakes out of production.

### Patch Changes

- [#1557](https://github.com/withplumix/plumix/pull/1557) [`4481cf2`](https://github.com/withplumix/plumix/commit/4481cf28a6b9feef66ddc4f002a2b1bdea9ab725) Thanks [@nasyrov](https://github.com/nasyrov)! - Reflect title, excerpt, meta, and template edits in the editor's visual canvas.

  The canvas iframe live-synced only block content over its bridge; the entry
  fields the theme template renders around the blocks — title, excerpt, meta,
  and a `named`-template pick — stayed at their load-time server render until a
  manual reload. Now, after such a field autosaves, the host reloads the canvas
  (debounced, coalescing a burst of edits into one reload; block content and the
  scroll position are preserved), so the theme output tracks the edit.

  Two paths fed the stale output, both fixed:

  - The host never signaled the canvas to refresh for these fields. `PlumixEditor`
    gains a `previewRefreshToken` the editor bumps after a title / excerpt / meta /
    template autosave; `CanvasFrame` reloads the iframe when it changes.
  - The `?preview=` render itself froze the title. `overlayPreviewAutosave` copied
    `title` from the autosave snapshot, overriding a later live title edit — but
    the title is a live field (written with `saveAs: "live"`, like slug / parent /
    terms, which already came from the live row). The preview now overlays only
    the drafted fields (content, excerpt, meta) and reads the title from live.

- [#1569](https://github.com/withplumix/plumix/pull/1569) [`112e1bd`](https://github.com/withplumix/plumix/commit/112e1bd6d0ab8f9579ef8a87651d3a996faf75b9) Thanks [@nasyrov](https://github.com/nasyrov)! - Treat the entry title as a live-only field on every read and write path.

  [#1544](https://github.com/withplumix/plumix/issues/1544) made the `?preview=` render read the live title, but three other paths
  still read the frozen autosave/revision snapshot, so the title diverged
  depending on where it was read:

  - `entry.publish` promoted the autosave's snapshot title onto the live row. A
    title edited on live after a content draft was written reverted to the stale
    snapshot on publish. Publish now leaves the live title untouched.
  - `entry.get` preview overlaid the snapshot title, so the editor form and the
    public preview could disagree. It now keeps the live title.
  - `entry.update`'s draft branch stored a caller-supplied title on the autosave
    row. It now anchors the snapshot column to the live title and ignores a
    drafted title (drafting a title independently of publishing is no longer a
    capability — the editor writes title straight to live with `saveAs: "live"`).
  - Restoring a revision onto an autosave-supporting type wrote the revision's
    title into the draft, where nothing read it back. It now anchors title to
    the live row, exactly like slug and parentId already do; only content,
    excerpt, and meta restore into the draft.

- Updated dependencies [[`976fc4d`](https://github.com/withplumix/plumix/commit/976fc4dc102529c25c6509da89e6bce151945dd5), [`077c515`](https://github.com/withplumix/plumix/commit/077c515e47d3e807d61b5ed4a0ff7cbc94839eff), [`741c6b4`](https://github.com/withplumix/plumix/commit/741c6b4b0c731e3fe8efd1c316a0ea4fd23b6e0d), [`ec117ea`](https://github.com/withplumix/plumix/commit/ec117ea45ed6ff064807ae2d6cee4dfb5b67cf35), [`9a1e88a`](https://github.com/withplumix/plumix/commit/9a1e88adb272f1f4795ddfd23e2958b4aa8b9443), [`6fe5583`](https://github.com/withplumix/plumix/commit/6fe5583954947ba11093fb053c946640b703b4b0), [`3d269a3`](https://github.com/withplumix/plumix/commit/3d269a399f6e36e499ef60846abe02716103d7a0), [`a5be41a`](https://github.com/withplumix/plumix/commit/a5be41a282fc4785c7cec582af0e97b3d99bed8a), [`f379b46`](https://github.com/withplumix/plumix/commit/f379b46b4c863bde6d4235a5753e7fd07926153c)]:
  - @plumix/blocks@0.8.0

## 0.7.0

### Minor Changes

- [#1536](https://github.com/withplumix/plumix/pull/1536) [`b7f3810`](https://github.com/withplumix/plumix/commit/b7f3810be8e72ba44d05f74fb663dec3c6cb906a) Thanks [@nasyrov](https://github.com/nasyrov)! - Enforces every declarative field constraint server-side through one generic walker over the field definitions, and addresses write rejections to the exact field (breaking, pre-1.0). The per-value pipeline is now coercion → `.sanitize()` (typed transform) → declarative constraints → `.validate()` (sync or async, `true` or an i18n-able message — executed for the first time). The walker covers required (previously a UI-only promise), `maxLength`, numeric and temporal bounds (temporal previously UI-only, now with stored-shape format checks), option membership and selection counts, row counts, and email/url/color/link format checks — replacing the per-factory hand-injected sanitizers on `range`, `color`, `select`, `link`, `richtext`, and `repeater`, so `.sanitize()` is purely the author's transform and can no longer disable a declared constraint. Failures aggregate across the whole patch into `CONFLICT.data.errors` as `{ path, message }` pairs — `path` dot-joins into nested repeater cells (`sections.2.heading`), `message` is a plain string or a message descriptor with its interpolation values — and the admin metabox form pins each onto the addressed input inline (term edit, user edit, and the entry editor's document panel). `sanitizeMetaInput`/`sanitizeMetaForRpc` are now async; sanitize callbacks that throw map to a path-addressed generic invalid error instead of carrying custom reasons (use `.validate()` for custom messages).

- [#1554](https://github.com/withplumix/plumix/pull/1554) [`4f5b96a`](https://github.com/withplumix/plumix/commit/4f5b96aeebd75f0dde824fbe763fe7c040094c9c) Thanks [@nasyrov](https://github.com/nasyrov)! - Validate entry meta leniently on draft saves and strictly on publish, so
  work-in-progress never fails to save while published content stays valid.

  The field pipeline gains a `draft` / `strict` mode. In `draft` mode the
  business-rule constraints — required, numeric / temporal bounds, `maxLength`,
  option membership, format checks, repeater / group row counts, and
  `.validate()` — are skipped; the structural + security gates (type coercion,
  shape normalization, `.sanitize()`, temporal validity, and the url safe-href
  check) always run, so a draft can never persist corrupt or unsafe data.

  Autosaves and draft-status writes use `draft`; anything that lands the entry
  as published or scheduled uses `strict`. Publishing re-validates the **whole**
  promoted bag against the full field list — catching a required field the
  draft left absent, not only one stored empty — and a violation aborts the
  publish with a per-field `CONFLICT` the admin pins onto its inputs. Fields the
  publisher lacks the capability to write are excluded from that gate, so a
  co-author's value can't block an unrelated publish.

  This reverses the previous behavior where autosave rejected incomplete content
  (the recurring "Couldn't save your changes — they may contain invalid content"
  failure while editing) and publish promoted a stored bag without re-checking
  its constraints.

- [#1534](https://github.com/withplumix/plumix/pull/1534) [`40d4221`](https://github.com/withplumix/plumix/commit/40d4221e6f880e7bc653ff948adc339f06a78d4b) Thanks [@nasyrov](https://github.com/nasyrov)! - Adds conditional field visibility authored from field references: condition factories typed per driving field (`.is()`, `.gt()`, `.isOn()`, containment/count on multi-select) feed `.visibleWhen()`/`.orVisibleWhen()` groups that show/hide admin fields live and skip server-side validation of hidden fields.

- [#1529](https://github.com/withplumix/plumix/pull/1529) [`3171824`](https://github.com/withplumix/plumix/commit/3171824efeebd85a89ae2edcac86c7a379cc8b5f) Thanks [@nasyrov](https://github.com/nasyrov)! - New `link()` field on `plumix/fields`: a fluent CTA-shaped value (`{ url, label?, newTab? }`) with the full universal chain and phantom `LinkValue | undefined` typing (narrowed by `.required()`/`.default()`). The value's shape and URL are server-validated on write (site-relative path or WHATWG-parseable absolute URL; unknown properties stripped) ahead of any chained `.sanitize()`. The admin metabox control authors the URL by typing an external URL or picking a public internal entry — resolved to its permalink via the lookup RPC — with a link-text input and an open-in-new-tab switch.

- [#1532](https://github.com/withplumix/plumix/pull/1532) [`1501f42`](https://github.com/withplumix/plumix/commit/1501f42f2431290f5ecdfbe35035948c90733511) Thanks [@nasyrov](https://github.com/nasyrov)! - Fluent field builders, part two (breaking, pre-1.0): the remaining eight scalar field constructors on `plumix/fields` — `number`, `range`, `date`, `datetime`, `time`, `color`, `richtext`, `json` — now author as immutable chained builders instead of flat option objects: `number("rating").min(1).max(5).step(0.5)`, `richtext("body").marks(["bold"]).nodes(["heading"])`. Per-type chains expose only the options that apply (`number(...).maxLength(...)` is a compile error); `range` requires `.min()`/`.max()` and enforces `min <= max` at registration; `color` and `range` keep their injected default sanitizers (a custom `.sanitize()` replaces them); `richtext` always injects the allowlist walker and deliberately offers no `.sanitize()`. Removed: the flat `NumberFieldOptions`/`RangeFieldOptions`/`DateFieldOptions`/`DateTimeFieldOptions`/`TimeFieldOptions`/`ColorFieldOptions`/`RichtextFieldOptions`/`JsonFieldOptions` types; `DateMetaBoxField`/`DateTimeMetaBoxField`/`TimeMetaBoxField` are now aliases of `TemporalMetaBoxField<I>`.

  New: `.returns("date")` on `date`/`datetime`/`time` projects the stored ISO string to a JS `Date` at decode time and the inferred read type follows (`Date | undefined`, narrowed by `.required()`/`.default()`); the default read stays the ISO string. Projected `Date`s anchor their wall-clock components to UTC (`date` at UTC midnight, `time` on 1970-01-01 UTC) so they survive any server/browser timezone split — read components back with `getUTC*` or `timeZone: "UTC"` formatting. Symmetrically, temporal fields now accept a `Date` on the write side and store the field's ISO shape from UTC components, so admin round-trips of projected values are lossless; `formatTemporalValue` on `@plumix/core/manifest` exposes the shared formatter.

- [#1531](https://github.com/withplumix/plumix/pull/1531) [`c067480`](https://github.com/withplumix/plumix/commit/c067480cb8ecb70d1be2a0ad6f26634bd919a2fd) Thanks [@nasyrov](https://github.com/nasyrov)! - Consolidates choice fields onto a fluent `select()` builder and adds `toggle()` (breaking, pre-1.0). `select("size").options(["s", "m"])` infers the option literal union as the value type; `.multiple()` flips reads to a readonly array and storage to a JSON array, unlocking selection-count `.max()`; `.appearance("select" | "radio" | "buttons" | "checkboxes")` picks the admin control without changing the value shape, and cardinality-illegal combinations are compile errors in either call order. `toggle()` renders the admin switch with `.onText()`/`.offText()` state labels and reads `boolean | undefined`, narrowed by `.required()`/`.default()`. Removes the flat `radio`, `multiselect`, and `checkbox` factories, their option types, and their wire variants — object literals using the retired `inputType` strings still compile via `LegacyMetaBoxField` and still render. `SelectMetaBoxField` becomes a `multiple`/`type`-correlated union, and the manifest wire carries `multiple`, `appearance`, `onText`, and `offText`.

- [#1527](https://github.com/withplumix/plumix/pull/1527) [`274a97c`](https://github.com/withplumix/plumix/commit/274a97c0c239ba1722965b00620e1ad91b54ef90) Thanks [@nasyrov](https://github.com/nasyrov)! - Fluent field builders (breaking, pre-1.0): the five string scalar field constructors on `plumix/fields` — `text`, `textarea`, `email`, `url`, `password` — now author as immutable chained builders instead of flat option objects: `text("subtitle").placeholder("…").maxLength(120)` replaces `text({ key, label, … })`. Labels default to the humanized key; the universal chain adds `.label()` (string or message descriptor), `.description()`, `.placeholder()`, `.prepend()`/`.append()`, `.default()`, `.required()`, `.span()`, `.capability()`, `.showInApi()`, `.sanitize()`, and `.validate()`, with phantom value typing (`string | undefined`, narrowed to `string` by `.required()`/`.default()`). Every `fields` registration surface (entry/term/user meta boxes, settings groups, repeater `subFields`) accepts builders alongside plain field definitions and compiles them at registration. `.span()` is accepted on every surface as a universal layout hint — the `EntryMetaBoxField` span-omit union is gone (the entry editor rail still ignores and strips the hint). Removed: the flat `TextFieldOptions`/`TextareaFieldOptions`/`EmailFieldOptions`/`UrlFieldOptions`/`PasswordFieldOptions` types; the five per-variant field interfaces are now aliases of `StringMetaBoxField<I>`. Repeater rows no longer feed absent (`null`/omitted) subfield values into sanitize callbacks, mirroring top-level deletion semantics.

- [#1538](https://github.com/withplumix/plumix/pull/1538) [`9087ed0`](https://github.com/withplumix/plumix/commit/9087ed0c9dfc720b5b3b135691bade4a9afbe28d) Thanks [@nasyrov](https://github.com/nasyrov)! - Read-time reference hydration is now cache-correct: a page that embeds a referenced entity carries that entity's cache tag and is purged when the entity changes. A per-request accumulator collects tags during hydration and the public read-through folds them into the page's stored cache tags, so editing, deleting, or otherwise changing an embedded entry busts the pages that hydrated it (the entry adapter contributes its precise `e:<id>` tag through the existing purge pipeline). Lookup adapters gain an optional `embeddedCacheTags(payload)` method to declare the tag a hydrated payload contributes; kinds without a per-entity purge identity (e.g. `user`) omit it. A new server-side `hydrateReferences(ctx, kind, ids, { scope })` helper gives themes the same batched adapter path and tag accounting for id-only reference fields, resolving an id set in one in-query per chunk and returning the hydrated payloads dense and in requested order. Pages that hydrate nothing are tagged exactly as before.

- [#1552](https://github.com/withplumix/plumix/pull/1552) [`f58edfb`](https://github.com/withplumix/plumix/commit/f58edfbfa4d743ec41143366da219160cfc3e9fb) Thanks [@nasyrov](https://github.com/nasyrov)! - Make the `range()` field's bounds compile-required. `range(key)` now returns a
  seed exposing only `.bounds(min, max)`, which returns the field builder — so
  forgetting the slider's `[min, max]` track is a type error rather than a runtime
  throw at registration. This mirrors the `select(key).options(...)` and
  `repeater(key).fields(...)` seed pattern.

  Breaking: `range("x").min(0).max(100)` becomes `range("x").bounds(0, 100)`
  (other chain methods are unchanged, and `min <= max` is still validated at
  registration).

- [#1535](https://github.com/withplumix/plumix/pull/1535) [`63afd4f`](https://github.com/withplumix/plumix/commit/63afd4f2a3f5e8197ba26b9145b75e52a548b61b) Thanks [@nasyrov](https://github.com/nasyrov)! - Reference meta fields hydrate at read time (breaking, pre-1.0). Lookup adapters gain an optional batched `hydrate({ ids, scope })` contract; core's `entry`/`term`/`user` adapters resolve ids into public-safe summary shapes (`EntryReferenceSummary` with title/slug/url, `TermReferenceSummary`, `UserReferenceSummary` — never email/role), and the media adapter resolves a full media item including its URL, so themes can finally render a media meta field. Hydrated shapes are declared per kind in the merged `ReferenceHydrationShapes` registry, augmentable by plugins. The read pipeline (`hydrateMetaBags`, replacing `filterMetaOrphans`) runs hydration and orphan-stripping as one traversal: ids aggregate across all reference fields of all entries in a response and resolve with one in-query per `(kind, scope)` group — public render template data, admin oRPC reads, and REST projection all return hydrated values. Hydration is one level deep (a hydrated entry's own references stay ids), deleted referenced entities read as absent (single refs `null`, multi refs dropped, arrays stay dense), and kinds whose adapter predates `hydrate` keep the plain-id read shape. Unpublished referenced entries are clamped away from viewers without `edit_any` on the referenced type, so public render and anonymous REST never leak a draft's title through hydration. Hydrated values round-trip safely through writes — the sanitizer and the autosave merge heal `{ id, ... }` payloads back to plain ids. Admin reference pickers accept the hydrated object values and keep operating on ids.

- [#1553](https://github.com/withplumix/plumix/pull/1553) [`011174b`](https://github.com/withplumix/plumix/commit/011174b37b3015b033191e72426c5b7849c33df2) Thanks [@nasyrov](https://github.com/nasyrov)! - Polish the repeater row editor and fix a data-loss bug in its summary rail.

  - **New `repeater(...).dialogSize("sm" | "md" | "lg")`** sets the row-editor
    dialog width (`sm:max-w-lg` / `sm:max-w-2xl` / `sm:max-w-4xl`; default `md`).
    Widen it for dense, multi-column rows. Threaded core builder → manifest →
    admin like the existing `.layout()` / `.collapsed()` hints.
  - **Data loss on add / remove / reorder after editing a row is fixed.** The
    summary rail read the parent Controller's snapshot, which doesn't re-render
    when a subfield is edited inside the row dialog; the next structural change
    then committed an array missing the just-edited row's values. It now reads
    the live array via `useWatch`.
  - **Row-editor dialog no longer breaks layout when a field shows a validation
    message** — the grid stretched every sibling cell to the errored field's
    height and vertically centered their controls out of line; cells now
    top-align.
  - **Toggle fields render label-above** like every other grid field, so a
    toggle sharing a row with text / number inputs aligns on the input midline
    instead of floating at the siblings' label height.
  - The summary row's **Edit control is now an icon-only button** (was a
    text button that turned red on error); error state is conveyed solely by the
    warning indicator, and destructive styling is reserved for the remove button.
    Its accessible name is row-numbered ("Edit row 3") so a screen reader can
    tell the rows apart.

- [#1550](https://github.com/withplumix/plumix/pull/1550) [`0a185ba`](https://github.com/withplumix/plumix/commit/0a185baf413211727c36971e8880c2a670bede6d) Thanks [@nasyrov](https://github.com/nasyrov)! - Rework the metabox repeater UI. Rows previously crammed every field inline into
  the narrow document rail, ran tall, and dropped each subfield's `.span()`. Now
  each row is a compact, scannable summary (a label from the `.collapsed()`
  subfield or the first non-empty value) with an Edit button; editing opens a
  roomy dialog that lays the row's fields out on the same 12-column grid the box
  uses, honoring each subfield's `.span()`. Adding a row opens its editor
  directly, and a row whose fields hold a validation error is flagged so it's
  discoverable while the dialog is closed. Groups likewise lay their members out
  on a span-aware grid.

  Repeater and group subfields now carry their `span` on the manifest wire
  (previously dropped as "children are full-width", since the old inline rail
  couldn't honor it) so the composite editors can lay them out.

- [#1547](https://github.com/withplumix/plumix/pull/1547) [`3df62e3`](https://github.com/withplumix/plumix/commit/3df62e300348aa90bb8b4a9fd1883adf8e5c03ee) Thanks [@nasyrov](https://github.com/nasyrov)! - Add `EntryMeta` / `TermMeta` / `UserMeta` / `SettingsMeta` helper types for
  declaring typed-meta contributions. Instead of hand-writing the contribution
  shape, plugin authors write:

  ```ts
  import type { EntryMeta } from "plumix";

  declare module "plumix" {
    interface EntryMetaContributions {
      article: EntryMeta<"post", typeof articleFields>;
    }
  }
  ```

  The helpers fold identically to the raw `{ entryTypes; fields }` object but
  remove a silent-failure footgun — misspelling `entryTypes` left the
  contribution structurally valid yet unmatched by the read-type fold, so the
  fields read as absent with no error. The target-name generic is also
  constrained to registered entry types / taxonomies, surfacing an unknown
  target at the declaration itself. `EntryMeta`'s JSDoc carries the end-to-end
  walkthrough from declaring fields to typed `forEntryType(...).template(...)`
  reads.

- [#1530](https://github.com/withplumix/plumix/pull/1530) [`a55a17c`](https://github.com/withplumix/plumix/commit/a55a17cfb577b8e5f21b428496bd2a0d76b9fffd) Thanks [@nasyrov](https://github.com/nasyrov)! - Typed meta reads (breaking, pre-1.0): declared fields now flow into typed reads everywhere via contribution-keyed registries. Augment `EntryMetaContributions` / `TermMetaContributions` / `UserMetaContributions` (keyed by box id) or `SettingsContributions` (keyed by group name) with `{ entryTypes: "post"; fields: typeof myFields }`, and `MetaOf<K>` / `TermMetaOf<K>` / `UserMetaOf` / `SettingsOf<Name>` fold every contribution targeting `K` into one closed record — a mistyped field name is a compile error in the theme. Targeted templates (`forEntryType(...)`, `forTermTaxonomy(...)`) receive entries and terms with the folded typed `meta` (`ResolvedEntryFor<K>` / `ResolvedTermFor<K>`), and `whereMeta` keys/values are typed against the distinct stored shapes (`StoredMetaOf<K>` / `StoredTermMetaOf<K>` via `InferStoredFields` — `.default()` narrows only the read shape). When a contribution declaration exists for a box id, the matching `register*` call is typechecked against it (target set and fields must match); a missing declaration degrades to absence from the typed record and can be supplied from any package via interface merging. Removed: the `meta` projection slot on `EntryTypeRegistry` / `TermTaxonomyRegistry` — `MetaOf`/`TermMetaOf` no longer read it and no longer fall back to an open `Record<string, unknown>`, so `whereMeta` on a type with no declared contributions accepts no keys.

- [#1551](https://github.com/withplumix/plumix/pull/1551) [`e9a14b1`](https://github.com/withplumix/plumix/commit/e9a14b18460915e8aa210047d63f5d6097b3b24a) Thanks [@nasyrov](https://github.com/nasyrov)! - Entries can be created and saved untitled. A new entry is no longer seeded with
  a literal "Untitled" title the author has to delete (typing prepended onto it) —
  `entry.create`'s title is now optional (stored as `""`), `entry.update` accepts
  an empty title (to clear it), and the editor's title field shows a placeholder.

  Read surfaces render a fallback for the empty title: the public `<title>` and
  feeds fall back to the site name / a fixed label, and the admin entry lists,
  dashboard, and command palette show "(no title)" instead of a blank row.

  Also fixes an unset single-select (`appearance: "buttons"`) that could appear to
  highlight its first option when no value is set — it now shows no selection,
  matching the radio control.

### Patch Changes

- [#1533](https://github.com/withplumix/plumix/pull/1533) [`7d5d664`](https://github.com/withplumix/plumix/commit/7d5d664dca8c1fb726b9fc7f1607b3ad41d26708) Thanks [@nasyrov](https://github.com/nasyrov)! - The `entry.update` autosave route now runs the same meta gate as a live write — field sanitizers, field-level capability checks, and reference validation — before persisting the autosave bag. Previously raw client meta was stored on the autosave row and `entry.publish` promoted it verbatim onto the live entry, so declared sanitizers (e.g. `color()`'s hex lowercasing) never ran, capability-gated fields could be written by autosaving then publishing, and dangling reference ids reached the published row. A `null` meta value on autosave now deletes the key on promotion (matching live-write delete semantics) instead of persisting a literal `null`.

- [#1543](https://github.com/withplumix/plumix/pull/1543) [`864aa9a`](https://github.com/withplumix/plumix/commit/864aa9aef5dc3b950c3a65057cb65b9b88e3a797) Thanks [@nasyrov](https://github.com/nasyrov)! - Entry autosave no longer silently drops meta edits. The editor and plain-form now send only the changed meta keys, so a key the editor doesn't own (e.g. a `featuredImage` written by another plugin) is never re-validated and can't fail the whole write with `meta_not_registered`. The autosave row now accumulates content/excerpt/meta on the existing draft instead of rebasing on the live row on every write, so a partial autosave no longer drops a key an earlier one set — title stays anchored to the live row, which the editor writes it to directly. Both editor debouncers are serialized through one save queue so they can't race the shared optimistic-concurrency token into `409` conflicts, a recovered stale conflict retries once instead of surfacing a failure, and a deletion of an unregistered meta key is now a harmless no-op.

- [#1539](https://github.com/withplumix/plumix/pull/1539) [`4617ca9`](https://github.com/withplumix/plumix/commit/4617ca9b66873d4c83debe78f8d7f2a3b58e2479) Thanks [@nasyrov](https://github.com/nasyrov)! - `entry.publish` now re-sanitizes the registered meta keys of the autosave bag before promoting it onto the live row, rather than promoting verbatim. The write-time gate (previous release) only canonicalizes autosaves written after it deployed; a draft persisted before that fix could still carry unsanitized values onto a published entry. The publish path now runs each registered field's `.sanitize()` pipeline and passes unregistered keys (data from uninstalled plugins) through untouched, so it never rejects a legitimate live bag as `meta_not_registered`. The gate is forgiving like the read path: because a whole bag is promoted rather than a caller's touched patch, a value that fails validation is treated as schema drift and kept as stored rather than aborting an unrelated publish — the live write path remains the gate for user intent. Field capabilities and reference existence are intentionally not re-checked at publish.

- [#1548](https://github.com/withplumix/plumix/pull/1548) [`538d64d`](https://github.com/withplumix/plumix/commit/538d64d4cf0767f4302e3287ebb8c1b752105027) Thanks [@nasyrov](https://github.com/nasyrov)! - Render the metabox `richtext()` field as a real Tiptap editor instead of a raw-JSON textarea.

  The block editor's rich-text editor is now shared: it gained a JSON serialization mode (reads/writes the ProseMirror doc the field stores) and an optional marks/nodes allowlist that constrains both the editor schema and the toolbar, so a field authored with `.marks(["bold","link"]).nodes(["heading"])` only offers — and can only produce — the formatting it declares. The block editor's own usage is unchanged (HTML serialization and the full toolbar remain its defaults). The editor is code-split, so forms without a richtext field never load the ProseMirror chunk.

  Also fixes the server-side richtext validator to implicitly allow `hardBreak` and `listItem`: the shared editor always ships a Shift+Enter line break, and any allowed list carries list items, so a natural `.nodes(["bulletList"])` field could previously produce content its own editor offered but the server then rejected on save.

- Updated dependencies []:
  - @plumix/blocks@0.7.0

## 0.6.0

### Minor Changes

- [#1526](https://github.com/withplumix/plumix/pull/1526) [`bcd76ed`](https://github.com/withplumix/plumix/commit/bcd76ed4240f30daa79a2a421d042d2afb6f9aa3) Thanks [@nasyrov](https://github.com/nasyrov)! - Reference meta fields now store plain ids (or id arrays) — the write-time snapshot machinery is gone: the object value-shape (`ReferenceTarget.valueShape`), the adapter cached-fields seam (`LookupResult.cached`), and the write-time cached-reference rewrite are all removed. Values stored under the old `{ id, ... }` shape self-heal transparently: reads yield the id, and the entity's next save persists the plain form. `LookupResult` gains a first-class `href` (entry permalink / term archive) that menu resolution reads directly. The media `media()` / `mediaList()` builders drop the `MediaValue` type (`default` is now an id / id array), and the admin media pickers resolve labels through the batched lookup path instead of stored snapshots.

- [#1520](https://github.com/withplumix/plumix/pull/1520) [`902a922`](https://github.com/withplumix/plumix/commit/902a922b8dc5652700cc9cbbb8f00726b34a482c) Thanks [@nasyrov](https://github.com/nasyrov)! - Repeated reads dedupe within a request through a new request-scoped read-through memo on `ctx` (`ctx.memo`, plus a `memoBatch` helper for per-id memoization over one batched query). The hot single-row lookups now read through it inside the existing service functions: the `site` settings group (head defaults, SEO surfaces, and the settings template dep share one query), author rows in `buildResolvedEntries`, the entry-type probe (new shared `readEntryType`, deduping the comments template dep against the blog related-posts loader), and the menu query cluster (shared between the `menus` template dep and `getMenuForLocation`, which now rides `ctx.memo` instead of a bespoke WeakMap). `plumix/test` gains `createTracedContext` and `createRequestMemo` for query-count assertions and `AppContext` stand-ins.

- [#1521](https://github.com/withplumix/plumix/pull/1521) [`75ef282`](https://github.com/withplumix/plumix/commit/75ef282365fc02cf9520494e3f757cf5a6879880) Thanks [@nasyrov](https://github.com/nasyrov)! - New `@plumix/core/telemetry-otel` subpath: `otelConsumer(...)` is an OTel trace exporter as a telemetry consumer. One entry in `telemetry.consumers` ships each collected request's span waterfall to any OTLP/HTTP backend (Grafana Cloud Tempo, a local otel-collector, …) as an `ExportTraceServiceRequest` — root `SERVER` span from the request envelope with HTTP semconv attributes, the collected span tree as `INTERNAL` children (ids minted at export time), records as root-span events, errors as `STATUS_ERROR` plus `exception` events, and cap-dropped counts surfaced. Supports head sampling (`sample` ratio), tail sampling (`tailSample` on the finished snapshot), and joining a caller's trace via an inbound W3C `traceparent`. Exports run per request from `waitUntil`; failures are logged, never surfaced to the request path. Zero dependencies — the OTLP/JSON payload is hand-rolled to stay Workers-lean.

- [#1517](https://github.com/withplumix/plumix/pull/1517) [`af1af74`](https://github.com/withplumix/plumix/commit/af1af74a925ea4ba5f8ab1c153a466a13195ad68) Thanks [@nasyrov](https://github.com/nasyrov)! - Telemetry now covers the remaining span-tree interiors and platform I/O slots. The `render` phase gains child spans for its previously invisible tail: `render: deps` (template-dep loaders), `render: head` (SEO gap-fillers), `render: loaders` (block loader prefetch), and `render: react` (the `renderToString` pass) — error-page renders included. The platform I/O slots are wrapped once at context assembly, mirroring `ctx.fetch`: `cache: match`/`cache: put`, `assets: fetch`, `storage: put|get|head|delete|list`, and `mailer: send` spans now appear for every consumer. Note `ctx.assets`/`ctx.storage`/`ctx.cache`/`ctx.mailer` are no longer the configured objects by identity — they are interface-preserving traced wrappers, so code stashing extra properties on a custom slot object and reading them back off `ctx` must keep a direct reference instead. Span coverage and deliberate exclusions are documented in `docs/telemetry.md`.

### Patch Changes

- [#1513](https://github.com/withplumix/plumix/pull/1513) [`f737d54`](https://github.com/withplumix/plumix/commit/f737d54854c422ad564c98649b58c2a259f8322b) Thanks [@nasyrov](https://github.com/nasyrov)! - Static-asset 404s (the short-circuit for `favicon.ico`, `/assets/*` and friends) now carry `Cache-Control: public, max-age=300`, so browsers and CDNs absorb repeated probes instead of invoking the worker each time. Safe to cache because the extension check makes these paths permanently unroutable; the TTL only bounds how long a freshly deployed asset can be shadowed. Content 404s remain uncacheable.

- [#1498](https://github.com/withplumix/plumix/pull/1498) [`642dcf6`](https://github.com/withplumix/plumix/commit/642dcf6b2cd42e4f9aca5ddf007dc3f6b1f7f613) Thanks [@nasyrov](https://github.com/nasyrov)! - Stops asset-shaped 404s from paying route resolution and a themed render. A public request whose path ends in a static-asset extension (`.ico`, `.css`, `.js`, images, fonts, `.map`, `.wasm`) short-circuits to a plain-text 404 before the route map runs — previously a stray `favicon.ico` or `/assets/*` miss ran a page-slug lookup plus the full themed 404 page (~9 DB queries per request). Content-plausible extensions (`.txt`, `.xml`, `.json`, `.html`) stay routable.

  Two related error-path changes:

  - A 404 or 500 for a client whose `Accept` header negotiates away from HTML (e.g. `application/json`) now returns the plain-text error instead of the themed page. Browser-shaped requests, a missing `Accept`, and `*/*` keep the themed render.
  - `renderErrorThroughTheme` now opens a `render` telemetry span like the happy path, so error-page queries no longer dangle directly under `dispatch` in traces.

- [#1524](https://github.com/withplumix/plumix/pull/1524) [`d6c456a`](https://github.com/withplumix/plumix/commit/d6c456a6bf365f492a7024bf7a83da77d006b8d7) Thanks [@nasyrov](https://github.com/nasyrov)! - On subdirectory mounts (`basePath`), asset-shaped requests outside the base — above all the browser's root `/favicon.ico` probe — now get the same cacheable plain 404 (`Cache-Control: public, max-age=300`) as in-base asset misses, instead of an uncacheable worker-invoking 404. Out-of-base paths can never be routed by the app, so the cacheability argument is strictly stronger than for in-base misses; non-asset out-of-base 404s remain uncacheable.

- [#1515](https://github.com/withplumix/plumix/pull/1515) [`4c9205a`](https://github.com/withplumix/plumix/commit/4c9205a8dfadfd9b54983b032e234bf4c7ab9ec8) Thanks [@nasyrov](https://github.com/nasyrov)! - Stops `plumix dev` from emitting a stale bundled-CSS link on every page. A prior `plumix build` leaves the asset manifest on disk; its hashed stylesheet URLs are not served by the dev server, so each page view triggered one extra 404 request. Bundled CSS links now emit only in build — dev styling already arrives via the theme-styles client entry.

- [#1523](https://github.com/withplumix/plumix/pull/1523) [`dad17a3`](https://github.com/withplumix/plumix/commit/dad17a3f71a8881b5b5ed1dbd387c0f8d2aa520e) Thanks [@nasyrov](https://github.com/nasyrov)! - The entry lookup-adapter scope can now express a status constraint (`scope: { entryTypes, status: "published" }`), pushed into the adapter's own `WHERE`. The menu resolver's published pre-filter query is gone — entry refs resolve in a single batched read instead of two back-to-back queries over the same ids on every public render. The admin picker keeps the current default (no status constraint, drafts admitted).

- Updated dependencies []:
  - @plumix/blocks@0.6.0

## 0.5.0

### Minor Changes

- [#1477](https://github.com/withplumix/plumix/pull/1477) [`7ddd056`](https://github.com/withplumix/plumix/commit/7ddd056a28538719094263c21c4476ec0e203aa5) Thanks [@nasyrov](https://github.com/nasyrov)! - Let users edit their author slug from the admin profile / user-edit screen. The `users.slug` behind `/authors/{slug}` was auto-derived and immutable; `user.update` now accepts a `slug` field, validated with the shared `slugSchema`.

  Unlike the auto-dedup used at creation, an explicit edit surfaces a collision as `CONFLICT { reason: "slug_taken" }` (mirroring the entry-create flow) rather than silently appending a numeric suffix. Any user can edit their own slug (`user:edit_own`); admins can edit anyone's (`user:edit`). The user-edit form gains an "Author slug" field with copy warning that changing it breaks existing `/authors/` links.

- [#1479](https://github.com/withplumix/plumix/pull/1479) [`ff1d101`](https://github.com/withplumix/plumix/commit/ff1d1011486e4de0a97c29acd1de33330299dd6f) Thanks [@nasyrov](https://github.com/nasyrov)! - Add an entry-editor template picker for theme-registered `named` templates. A theme exposes author-selectable templates via `forEntryType("page").named("landing", "Landing Page").template(...)` (shipped in [#1445](https://github.com/withplumix/plumix/issues/1445)); this wires up the missing producer so authors can actually choose one.

  - The editor's Page tab shows a "Template" picker listing the `named` templates registered for the current entry type, plus a "(theme default)" option. The pick is written to the reserved `__plumix_template` entry-meta key via a new first-class `template` field on `entry.update` (`null` clears it) — it bypasses the plugin meta-box sanitizer, which still rejects the reserved key on the `meta` path.
  - The set of named templates per type is surfaced to the precompiled admin through the manifest (`collectNamedTemplates` → `buildManifest` options → `EntryTypeManifestEntry.namedTemplates`), never a direct theme import.
  - The preview overlay now keeps `__plumix_template` when stripping reserved autosave meta, so an unsaved pick drives the preview render. A published entry's saved choice resolves to its template on the public route.

- [#1487](https://github.com/withplumix/plumix/pull/1487) [`a69b39e`](https://github.com/withplumix/plumix/commit/a69b39e2d909f21cb59c287e4a3e90f83e1e9392) Thanks [@nasyrov](https://github.com/nasyrov)! - Add the telemetry consumer contract and split the collection gate off the debug bar. A site operator registers consumers once in app config and receives a JSON-serializable snapshot of every sampled request post-response:

  ```ts
  plumix({
    telemetry: {
      consumers: [
        {
          id: "my-exporter",
          sample: (ctx) => Math.random() < 0.1, // head-sampling; omitted = always
          onRequestEnd: async (snapshot, ctx) => {
            /* envelope + span tree + records + dropped counters */
          },
        },
      ],
    },
  });
  ```

  - The collector core is now always present in production bundles and activates per request iff at least one registered consumer votes yes — with no consumers it stays the no-op and production pays nothing. The debug-bar UI remains dev-only and dead-code-eliminated; in dev it registers as the first consumer.
  - `TelemetrySnapshot` carries a request envelope (`requestId`, `method`, `url`, `status`, `startedAt`, `durationMs`), root spans, timestamped records by namespace, and dropped counters. Delivery rides `ctx.defer` — `waitUntil` on the Cloudflare adapter — so export I/O never blocks the response; a 500 still delivers its snapshot.
  - New public types from `@plumix/core`: `TelemetryConsumer`, `TelemetrySnapshot`, `TelemetryRequestEnvelope`, `TelemetryConfig` (plus the existing span/record types are now exported).
  - The collector no longer source-drops namespaces for disabled debug-bar panels — panel disable stays a render-time filter; data collection is consumer-owned.

- [#1495](https://github.com/withplumix/plumix/pull/1495) [`b3ad524`](https://github.com/withplumix/plumix/commit/b3ad5247e8dcfd6c2adaeb03f0e22c8a5b5e530d) Thanks [@nasyrov](https://github.com/nasyrov)! - Telemetry coverage sweep: every execution path now produces a full span tree through `ctx.telemetry` ([#1485](https://github.com/withplumix/plumix/issues/1485)).

  - Phase spans carry attributes: `dispatch` records the response status; `resolve` records the route intent, resolved entity, and matched template (stamped even when the render throws); `render` records the resolved node.
  - New spans at existing choke points: auth/session resolution (`auth` span with outcome + user id at every authenticate site, bearer included), per-handler hook execution (`hook: <name>` with `hook.plugin`, on the async `applyFilter`/`doAction` pipelines), and per-task cron runs (`cron: <id>`).
  - Edge-cache decisions are recorded as durationless `cache` facts: `hit`, `miss` (+ whether stored), or `bypass` with the failing gate as `reason`.
  - MCP `tools/call`, REST, and admin RPC dispatch each produce a named span per tool/procedure; scheduled runs deliver their own snapshot post-run (the Cloudflare adapter now passes the telemetry config to the scheduled context).
  - New `ctx.requestId`, minted at context creation and reused as the snapshot envelope's `requestId`, so mid-request consumers and the finished snapshot correlate on one id.

- [#1489](https://github.com/withplumix/plumix/pull/1489) [`7455fa6`](https://github.com/withplumix/plumix/commit/7455fa68660a5f9ad85e8c6d5a728c747990289c) Thanks [@nasyrov](https://github.com/nasyrov)! - Add `ctx.fetch` — traced outbound HTTP. Same signature as global `fetch`; every call produces one telemetry span named `fetch: <METHOD> <host>` with OTel-mappable attributes (`http.request.method`, `url.full`, `http.response.status_code`), nested under the enclosing span. A rejecting fetch marks its span `status: "error"` with the serialized failure before the rejection propagates unchanged.

  Core and plugins should make external calls through `ctx.fetch` so slow third-party APIs show up in the request waterfall. Bare global `fetch` remains an untraced, unpatched platform boundary — the same line drawn for DB connections not obtained from `ctx.db`. W3C trace-context propagation (`traceparent` injection) is deferred to the future OTel exporter.

- [#1490](https://github.com/withplumix/plumix/pull/1490) [`5776069`](https://github.com/withplumix/plumix/commit/5776069d17ae9370c4a82c13f57150dfdf409009) Thanks [@nasyrov](https://github.com/nasyrov)! - Unifies automatic DB query tracing: every query flowing through `ctx.db` — libsql, D1, the demo runtime, and statements inside transactions — now appears in the telemetry snapshot as one `db: <kind>` span with `db.sql`, `db.params` (lazy, JSON-safe), and `db.rows` attributes, regardless of whether core or a plugin issued it.

  - One wrap at client construction per driver: `traceSqlClient` (libsql `execute`/`batch`/`transaction`), a new `traceD1Client` in the Cloudflare runtime (prepared statements, batches, and drizzle's emulated begin/commit transactions — timed for the first time), and the demo Durable-Object proxy callbacks. Batches are one round-trip and one span, carrying per-statement sql/params under `db.batch` and the summed row count.
  - Tracing is unconditional — no `PLUMIX_DEV` gate. Without an active collector (no consumer sampled the request) every span is a pass-through no-op, so production without telemetry consumers pays nothing; with a prod consumer registered, query spans now flow to it.
  - The drizzle-logger half of the old dual mechanism is deleted: `createDebugSqlLogger` is gone from `@plumix/core`, and the Database debug-bar panel renders from query spans (now with per-query durations) instead of the removed record channel. New shared helpers `traceDbQuery`/`traceDbBatch` are exported for runtime adapters.
  - DB connections not obtained from `ctx.db` remain an untraced platform boundary.

### Patch Changes

- Updated dependencies []:
  - @plumix/blocks@0.5.0

## 0.4.0

### Minor Changes

- [#1471](https://github.com/withplumix/plumix/pull/1471) [`47ec8e2`](https://github.com/withplumix/plumix/commit/47ec8e293dc3c0dd54da34c63c449182a302745e) Thanks [@nasyrov](https://github.com/nasyrov)! - Add author archives end-to-end: `/authors/{slug}` renders a paginated list of a given author's published entries, themeable like any other archive.

  The full seam is wired: a new `author` `RouteIntent`, framework routes for `/authors/:slug` (+ `/page/:n`), a `resolveAuthor` resolver (the author's published, public-type entries — unknown slug or out-of-range page → 404), an `author` `ResolvedNode`, a generic `author()` template tier, a `forAuthor(slug)` / `forAuthor(id)` targeted builder, and a typed `AuthorArchiveData { author; entries; pagination }`. An author RSS/Atom feed is served at `/authors/{slug}/feed`, and author-archive pages advertise it via `<link rel="alternate">`.

  ```ts
  defineTheme({
    templates: [
      author(AuthorArchive), // every author archive
      forAuthor().slug("jane").template(JaneArchive), // one author, by slug
      forAuthor().id(1).template(FounderArchive), // or by id
    ],
  });
  ```

  Authors are addressed by a new **`users.slug`** column (globally unique, mirroring `terms.slug` / `entries.slug`). It is derived from the user's name via `slugify` at creation — falling back to `user`, de-duplicated with a numeric suffix (`jane`, `jane-1`, `jane-2`), and never derived from the email — and is stable across later name changes. `ResolvedAuthor` now carries `slug`, so `data.author` / `entry.author` can link to an author archive.

- [#1474](https://github.com/withplumix/plumix/pull/1474) [`e96e27d`](https://github.com/withplumix/plumix/commit/e96e27d5b6e378fb049431871386c7dcc643bff1) Thanks [@nasyrov](https://github.com/nasyrov)! - Add date archives end-to-end: `/YYYY`, `/YYYY/MM`, and `/YYYY/MM/DD` render paginated lists of entries published in that period.

  The same seam as author archives: a `date` `RouteIntent`, numeric-constrained framework routes for the three granularities (+ `/page/:n`), a `resolveDate` resolver (a half-open `publishedAt` range query — an empty period renders the archive, an impossible date like Feb 30 or an out-of-range page → 404), a `date` `ResolvedNode`, a generic `date()` template tier, a `forDate(year[, month[, day]])` targeted builder, and a typed `DateArchiveData { year; month; day; entries; pagination }`. RSS/Atom feeds are served at `/YYYY[/MM[/DD]]/feed` and advertised on the archive page via `<link rel="alternate">`.

  ```ts
  defineTheme({
    templates: [
      date(DateArchive), // every date archive
      forDate(2026).template(YearInReview), // the /2026 year archive
      forDate(2026, 12, 25).template(Holiday), // the /2026/12/25 day archive
    ],
  });
  ```

  `forDate` matches one exact granularity — `forDate(2026)` targets the year archive, not that year's month/day archives.

- [#1475](https://github.com/withplumix/plumix/pull/1475) [`0ad5a4b`](https://github.com/withplumix/plumix/commit/0ad5a4bd85c8a57b2fe4cc6bc8803795775c6140) Thanks [@nasyrov](https://github.com/nasyrov)! - Let plugins register their own archive types — a URL pattern set + resolver + typed data + builder + feed — with no core changes, opening the previously-closed `RouteIntent`/resolver seam.

  `ctx.registerArchiveType(name, { routes, resolve, feed? })` adds a whole archive: matched URLs dispatch to the resolver (which returns `{ data, title }` or `null` → 404), and the data templates through `forArchiveType(name)` — a targeted builder that autocompletes and types `data` from an augmentable `ArchiveTypeRegistry`, exactly like `forEntryType` / `forTermTaxonomy`.

  ```ts
  // plugin
  ctx.registerArchiveType("event-series", {
    routes: ["/events/:series", "/events/:series/page/:page(\\d+)"],
    resolve: (ctx, params) =>
      params.series
        ? { data: { kind: "custom", name: "event-series", series: params.series, ... }, title: `…` }
        : null,
    feed: { routes: ["/events/:series/feed"], filter: (ctx, params) => /* SQL | null */ },
  });

  // typing (declare once)
  declare module "@plumix/core" {
    interface ArchiveTypeRegistry {
      "event-series": { data: EventSeriesData };
    }
  }

  // theme
  defineTheme({ templates: [forArchiveType("event-series").template(EventArchive)] })
  ```

  The five built-in archives (single/archive/taxonomy/author/date) are unchanged and keep working — the generalization adds a `custom` `RouteIntent` + `ResolvedNode` kind alongside them.

  Also reworks the feed subsystem: a registered archive can own an RSS/Atom feed (its base route serves both formats), and **nested-term feeds no longer 404** — a nested term's feed is served at its nested path (`/region/europe/france/feed`) when the taxonomy exposes hierarchical URLs.

- [#1469](https://github.com/withplumix/plumix/pull/1469) [`39b02e8`](https://github.com/withplumix/plumix/commit/39b02e8595e2d28291014d47bfa8f65d16f976f2) Thanks [@nasyrov](https://github.com/nasyrov)! - Give `forTermTaxonomy` the same predicate/named-template selectors `forEntryType` already has, so a template can target term archives by term meta or an arbitrary predicate:

  ```ts
  defineTheme({
    templates: [
      forTermTaxonomy("category")
        .whereMeta("featured", true)
        .template(FeaturedArchive),
      forTermTaxonomy("category")
        .where((data) => data.term.meta.pinned === 1)
        .template(PinnedArchive),
      forTermTaxonomy("category")
        .named("spotlight", "Spotlight")
        .template(Spotlight),
    ],
  });
  ```

  `whereMeta` keys and values are typed against the taxonomy's meta projection (declare `meta` in `TermTaxonomyRegistry` alongside `registerTermTaxonomy`, exported as `TermMetaOf<K>`); `where` receives the resolved `TaxonomyData`; `named` registers an author-selectable term template matched from stored term meta. Like entry predicates, a term predicate rule never matches when the resolved data is absent.

### Patch Changes

- Updated dependencies [[`47ec8e2`](https://github.com/withplumix/plumix/commit/47ec8e293dc3c0dd54da34c63c449182a302745e)]:
  - @plumix/blocks@0.4.0

## 0.3.0

### Minor Changes

- [#1456](https://github.com/withplumix/plumix/pull/1456) [`4cdb59e`](https://github.com/withplumix/plumix/commit/4cdb59ed70c2d83d5b1461a754970709cba92910) Thanks [@nasyrov](https://github.com/nasyrov)! - Redesign the theme template system around a typed, array-based `templates` model with router-style resolution.

  A theme's `templates` is now an **array of rules** built with typed helpers instead of a slug-keyed object. Generic tiers are direct builders — `fallback`, `entry`, `archive`, `taxonomy`, `frontPage`, `search`, `notFound`, `serverError` — and targeted rules are built with `forEntryType(name)` / `forTermTaxonomy(name)`, which autocomplete against the registered types, reject typos at compile time, and type `data.entry` / `data.term`:

  ```ts
  defineTheme({
    templates: [
      fallback(HomeAndArchives),
      entry(Post),
      forEntryType("page").template(Page),
      forEntryType("post").whereMeta("featured", true).template(FeaturedPost),
      forTermTaxonomy("category").slug("news").template(NewsArchive),
      notFound(NotFound),
    ],
  });
  ```

  Resolution follows a Laravel-router model: targeted rules in declaration order (first match wins), then the generic tier for the resolved node, then `fallback`. When nothing matches and there is no `fallback`, the request renders the 404 — a missing `fallback` is the "render-all vs. 404-on-miss" lever, not an error. Augment `EntryTypeRegistry` / `TermTaxonomyRegistry` alongside `registerEntryType` / `registerTermTaxonomy` to teach the builders your own types.

  The dev debug bar's Template panel now shows the full resolution walk for each request — every rule with a matched / skipped / never-evaluated status and its predicate outcome — so it's clear why a page got the template it did.

  **Breaking changes** (theme and plugin authors):

  - `templates` must be a `TemplateRule[]` (or a bare component as fallback shorthand). The slug-keyed object form (`{ index, single, "single-post", "404", … }`) is removed. Map old slots to builders: `index` → `fallback`, `single` → `entry`, `single-<type>` → `forEntryType("<type>").template`, `archive` → `archive`, `<taxonomy>` → `forTermTaxonomy(...)`, `404`/`500` → `notFound`/`serverError`.
  - The `notFound` export from `@plumix/core` / `plumix` is now the 404 **template builder**, not the HTTP `Response` helper (which is internal). Build error responses your own way.
  - `defineTemplate`'s `prefetchListingLoaders` field is renamed to `prefetchArchiveLoaders`.
  - The `template:hierarchy` hook filter is removed; template targeting is compile-time via the builders.

### Patch Changes

- Updated dependencies []:
  - @plumix/blocks@0.3.0

## 0.2.0

### Minor Changes

- [#1422](https://github.com/withplumix/plumix/pull/1422) [`1ff209a`](https://github.com/withplumix/plumix/commit/1ff209a56b1ed3d78e8a6eedb73ceaec056b588d) Thanks [@nasyrov](https://github.com/nasyrov)! - Add a development-only debug bar.

  Running `plumix dev` now renders a per-request debug bar, inspired by the
  WordPress Debug Bar and framework devtools. It is compiled out of production
  builds entirely (gated on `process.env.PLUMIX_DEV`), so it ships nothing to
  production.

  Panels cover the current **Request** (method, path, origin, and the
  authenticated user + token scopes), the resolved **Template** hierarchy (the
  ordered candidate list and which one won), **Database** queries (SQL syntax
  highlighting with the bound params shown separately), an **App** tab
  consolidating the site's static setup (config, locale, wired slots, installed
  plugins, and registered content types), and a **Timeline** waterfall of the
  request's spans — dispatch, resolve, render, and each database query, timed and
  nested by call structure.

  The bar is zero-JS (a server-rendered `<details>` element with CSS-driven tabs)
  and extensible: plugins add panels through the `debug_bar:panels` hook and
  record data through the request-scoped `ctx.debug` collector. Configure it via
  `debugBar` (enable/disable, position, which panels to hide). On Cloudflare, D1
  queries are surfaced in the Database and Timeline panels as well.

### Patch Changes

- Updated dependencies []:
  - @plumix/blocks@0.2.0

## 0.1.4

### Patch Changes

- [#1409](https://github.com/withplumix/plumix/pull/1409) [`9467449`](https://github.com/withplumix/plumix/commit/9467449d397f65ede387c83883f46c0f3064cc2f) Thanks [@nasyrov](https://github.com/nasyrov)! - Fix the visual editor being unusable under the Cloudflare demo runtime (and behind any non-cookie authenticator). Public-route renders only loaded the signed-in user when the standard `plumix_session` cookie was present, so a session established by a different signal — the demo's `plumix_demo` cookie, or Cloudflare Access's JWT header — rendered as anonymous. That left the editor's canvas iframe without its runtime, so blocks couldn't be selected, inserted, edited, or moved and the canvas wouldn't pan. Authenticators can now declare an optional `hasSession(request)` predicate so public renders recognise their sessions; the built-in demo and Cloudflare Access guards implement it. Also stops the demo toolbar pill from leaking into the editor canvas.

- Updated dependencies []:
  - @plumix/blocks@0.1.4

## 0.1.3

### Patch Changes

- [#1360](https://github.com/withplumix/plumix/pull/1360) [`c37b6db`](https://github.com/withplumix/plumix/commit/c37b6dba1913322aabc85e9b2876b433efe73351) Thanks [@nasyrov](https://github.com/nasyrov)! - Accept same-origin requests in the RPC/auth CSRF origin check. The check compared the request `Origin` against the canonical `app.origin` (from `auth.passkey.origin`); a deploy served on a different host than its configured origin — including the demo sandbox, whose origin varies per deploy — failed with `csrf_origin_mismatch` on every admin request. A request whose `Origin` equals the host it targets is not cross-site forgery, so it now passes the origin check. The `X-Plumix-Request` header gate remains the primary CSRF defense, and cross-origin requests are still rejected.

- [#1358](https://github.com/withplumix/plumix/pull/1358) [`17658a5`](https://github.com/withplumix/plumix/commit/17658a53b3fb2f5135527a6f6a195f8c5aa49756) Thanks [@nasyrov](https://github.com/nasyrov)! - Add a `virtual:plumix/worker-exports` codegen seam so a runtime adapter can contribute named exports — such as a Durable Object class — to the generated Cloudflare worker via `RuntimeAdapter.workerExports`. Core never learns about any specific feature; the seam is reusable by any future Durable Object, queue, or realtime adapter.

  The `auth.session` procedure now resolves the current user through the configured authenticator instead of a hardcoded session cookie, so custom authenticators (SSO, the demo sandbox) report the signed-in user on boot. The default cookie-backed behavior is unchanged.

- Updated dependencies []:
  - @plumix/blocks@0.1.3

## 0.1.2

### Patch Changes

- [#1333](https://github.com/withplumix/plumix/pull/1333) [`b493fbb`](https://github.com/withplumix/plumix/commit/b493fbb4b3cefec54322ea54023129b4ce1d1139) Thanks [@nasyrov](https://github.com/nasyrov)! - `r2()` and `images()` now resolve their configuration from the per-request env
  by convention, so a Cloudflare deploy's `plumix.config.ts` stays declarative
  instead of reading `process.env` at module load (which is empty on Workers).

  - `r2({ binding })` reads S3 presigned-upload credentials (`CF_ACCOUNT_ID`,
    `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `<BINDING>_BUCKET`) and
    `publicUrlBase` (`<BINDING>_PUBLIC_URL_BASE`) from the request env when the
    corresponding config slots are omitted. Explicit config always wins;
    presigned uploads stay disabled until all four credentials are present.
  - `images()` is now callable with no arguments and gains an optional
    `connect(env)` step, resolving its zone from `MEDIA_PUBLIC_URL_BASE` at
    request time and passing sources through untouched until that host is set.
  - `@plumix/core`'s `ImageDelivery` interface gains an optional `connect(env)`
    so runtimes can bind env-time image configuration.

  Backward compatible: existing explicit `r2({ ..., s3, publicUrlBase })` and
  `images({ zone })` configs are unchanged.

- Updated dependencies []:
  - @plumix/blocks@0.1.2

## 0.1.1

### Patch Changes

- [#1319](https://github.com/withplumix/plumix/pull/1319) [`843a184`](https://github.com/withplumix/plumix/commit/843a184ea755722f5b9d83664574eaf6ada97045) Thanks [@nasyrov](https://github.com/nasyrov)! - Bump runtime dependencies: radix-ui, lucide-react, and valibot (admin UI and validation), and markdown-it (comment rendering).

- Updated dependencies []:
  - @plumix/blocks@0.1.1
