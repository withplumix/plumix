# @plumix/runtime-cloudflare

## 0.6.0

### Minor Changes

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

- [#1490](https://github.com/withplumix/plumix/pull/1490) [`5776069`](https://github.com/withplumix/plumix/commit/5776069d17ae9370c4a82c13f57150dfdf409009) Thanks [@nasyrov](https://github.com/nasyrov)! - Unifies automatic DB query tracing: every query flowing through `ctx.db` — libsql, D1, the demo runtime, and statements inside transactions — now appears in the telemetry snapshot as one `db: <kind>` span with `db.sql`, `db.params` (lazy, JSON-safe), and `db.rows` attributes, regardless of whether core or a plugin issued it.

  - One wrap at client construction per driver: `traceSqlClient` (libsql `execute`/`batch`/`transaction`), a new `traceD1Client` in the Cloudflare runtime (prepared statements, batches, and drizzle's emulated begin/commit transactions — timed for the first time), and the demo Durable-Object proxy callbacks. Batches are one round-trip and one span, carrying per-statement sql/params under `db.batch` and the summed row count.
  - Tracing is unconditional — no `PLUMIX_DEV` gate. Without an active collector (no consumer sampled the request) every span is a pass-through no-op, so production without telemetry consumers pays nothing; with a prod consumer registered, query spans now flow to it.
  - The drizzle-logger half of the old dual mechanism is deleted: `createDebugSqlLogger` is gone from `@plumix/core`, and the Database debug-bar panel renders from query spans (now with per-query durations) instead of the removed record channel. New shared helpers `traceDbQuery`/`traceDbBatch` are exported for runtime adapters.
  - DB connections not obtained from `ctx.db` remain an untraced platform boundary.

## 0.5.1

### Patch Changes

- [#1473](https://github.com/withplumix/plumix/pull/1473) [`12a27ab`](https://github.com/withplumix/plumix/commit/12a27abd2e0055a7999baeaa57e426db12c96076) Thanks [@nasyrov](https://github.com/nasyrov)! - Fix the demo sandbox serving a stale schema after a deploy that changes the database schema or seed.

  The per-visitor and shared-showcase demo Durable Objects bootstrap their SQLite once and marked themselves ready with a version-agnostic flag, so a DO persisted from an earlier deploy never re-applied the newer bootstrap — any query touching a newly-added column then threw a 500 (e.g. `/authors/{slug}` after the author-archive `users.slug` column landed). The ready marker now records a version tag derived from the bootstrap SQL (schema migrations + seed); when a deploy changes that SQL, a stale DO drops its tables and re-applies the current bootstrap on its next request, healing itself with no manual reset. DOs carrying the old marker are treated as stale and re-bootstrap once.

## 0.5.0

### Minor Changes

- [#1467](https://github.com/withplumix/plumix/pull/1467) [`bff5961`](https://github.com/withplumix/plumix/commit/bff5961e126add12728750da995507f1a1124ae7) Thanks [@nasyrov](https://github.com/nasyrov)! - Move the demo sandbox's "Try the editor" call-to-action into the floating demo pill and redesign the loading interstitial.

  Anonymous visitors on the read-only showcase now get a "Try the editor" button in the demo pill (previously it lived in the example theme's header), while session holders keep the countdown / reset / deploy pill. The pill is now injected for anonymous requests too, with the variant chosen per request from the demo session cookie. The `/demo` provisioning screen is a centered, on-brand card with a single loading indicator, replacing the browser-default text pinned to the top-left.

## 0.4.0

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

## 0.3.1

### Patch Changes

- [#1409](https://github.com/withplumix/plumix/pull/1409) [`9467449`](https://github.com/withplumix/plumix/commit/9467449d397f65ede387c83883f46c0f3064cc2f) Thanks [@nasyrov](https://github.com/nasyrov)! - Fix the visual editor being unusable under the Cloudflare demo runtime (and behind any non-cookie authenticator). Public-route renders only loaded the signed-in user when the standard `plumix_session` cookie was present, so a session established by a different signal — the demo's `plumix_demo` cookie, or Cloudflare Access's JWT header — rendered as anonymous. That left the editor's canvas iframe without its runtime, so blocks couldn't be selected, inserted, edited, or moved and the canvas wouldn't pan. Authenticators can now declare an optional `hasSession(request)` predicate so public renders recognise their sessions; the built-in demo and Cloudflare Access guards implement it. Also stops the demo toolbar pill from leaking into the editor canvas.

- Updated dependencies []:
  - plumix@0.1.4

## 0.3.0

### Minor Changes

- [#1358](https://github.com/withplumix/plumix/pull/1358) [`17658a5`](https://github.com/withplumix/plumix/commit/17658a53b3fb2f5135527a6f6a195f8c5aa49756) Thanks [@nasyrov](https://github.com/nasyrov)! - Add an anonymous demo sandbox through the new `@plumix/runtime-cloudflare/demo` subpath. `demoPreset({ binding, loadSql, turnstile? })` returns a `runtime`/`database`/`auth` trio that hands every anonymous visitor an isolated, self-expiring Cloudflare Durable Object database — no sign-up — so a site can showcase its admin and editor.

  Cookieless visitors render a shared, read-only "showcase" database; clicking through provisions a per-session sandbox on demand, which self-cleans on a TTL alarm. Media writes are blocked (the storage bucket is shared) and security-sensitive routes are refused. Optional Turnstile gates provisioning against bots. The whole module is code-isolated on the subpath, so sites that don't opt in never bundle it.

### Patch Changes

- [#1361](https://github.com/withplumix/plumix/pull/1361) [`fc7aaab`](https://github.com/withplumix/plumix/commit/fc7aaab84c3e8e976b003660150f6c1c5a1286d4) Thanks [@nasyrov](https://github.com/nasyrov)! - Show the demo "Try the editor" CTA only to anonymous showcase visitors. It previously rendered for everyone, including inside the editor's own live preview and on the public site once a session existed. Adds `hasDemoSession(request)` (exported from `@plumix/runtime-cloudflare/demo`) so a theme can gate the CTA on the demo session cookie — `ctx.user` can't stand in, since core only resolves the public-render user for the default session cookie, not a custom authenticator's.

- [#1362](https://github.com/withplumix/plumix/pull/1362) [`100032d`](https://github.com/withplumix/plumix/commit/100032d84e6b757dd53ae8cbd5151e6c26d30eee) Thanks [@nasyrov](https://github.com/nasyrov)! - Make the demo toolbar responsive. Its contents used to wrap onto several cramped lines on narrow screens; it now stays a single-line pill at every width — the countdown and controls never wrap (`white-space: nowrap`), the pill is capped to the viewport, the deploy CTA shortens to "Deploy" on phones, and the bar clears the iOS home indicator via the safe-area inset.

- Updated dependencies [[`17658a5`](https://github.com/withplumix/plumix/commit/17658a53b3fb2f5135527a6f6a195f8c5aa49756)]:
  - plumix@0.1.3

## 0.2.1

### Patch Changes

- [#1335](https://github.com/withplumix/plumix/pull/1335) [`eb4e600`](https://github.com/withplumix/plumix/commit/eb4e6009b66f3525fa1c5d0dc89f0f6499d2b5e2) Thanks [@nasyrov](https://github.com/nasyrov)! - Fix Cloudflare deploys failing with `The "legacy_env" field is no longer
supported`. `@cloudflare/vite-plugin` is bumped to ^1.45.0, which builds the
  worker config with wrangler 4.111 — matching the wrangler the deploy step runs
  — so the generated `dist/*/wrangler.json` no longer emits the removed
  `legacy_env` field. Builds on wrangler 4.110 produced a config the newer deploy
  wrangler rejected.

## 0.2.0

### Minor Changes

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

### Patch Changes

- Updated dependencies [[`40cf6e6`](https://github.com/withplumix/plumix/commit/40cf6e627521269d8ea5947c86c99fc47447b6b2)]:
  - plumix@0.1.2
