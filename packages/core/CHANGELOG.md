# @plumix/core

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
