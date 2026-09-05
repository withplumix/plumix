# @plumix/runtime-cloudflare

## 0.10.1

### Patch Changes

- [#2222](https://github.com/withplumix/plumix/pull/2222) [`301429d`](https://github.com/withplumix/plumix/commit/301429dabe61f705785b9ba394a4ed1f075a9cd7) Thanks [@nasyrov](https://github.com/nasyrov)! - `create-plumix-app --runtime node` scaffolds a site that runs as a plain Node.js process: `node()` as the runtime, `nodeSqlite` on a file under `data/`, `diskStorage` when a plugin needs the storage capability, `.env` as the secrets file with an `.env.example`, `data` ignored, and a literal localhost passkey origin with a comment to change it for production. A plugin needing a capability Node does not provide, such as media's image delivery, is refused by name. The default runtime stays `cloudflare`.

  The base skeleton now leaves three things to the runtime: the ambient type packages the tsconfig lists, the README's Deploy section, and what the `clean` script removes. The Cloudflare block declares all three, so its projects are unchanged.

- [#2209](https://github.com/withplumix/plumix/pull/2209) [`c8bede7`](https://github.com/withplumix/plumix/commit/c8bede7407bf77c464e92f0b5f60a0a68bf74d59) Thanks [@nasyrov](https://github.com/nasyrov)! - Adds `buildAppClientFirst` to `plumix/vite`, the client-before-server build
  ordering a runtime's build command installs as Vite's `builder.buildApp`; the
  Cloudflare build command now imports it from there. Lets a runtime's
  `plumix.scaffold` block name its local secrets file (`secretsFile`, default
  `.dev.vars`) and the paths its tooling writes into `.gitignore` (`gitignore`),
  so the scaffolder's base `.gitignore` and generated config comment stop naming
  wrangler. A scaffolded Cloudflare project is unchanged apart from the order of
  two `.gitignore` lines and the wording of the secrets comment. The scaffold
  smoke job runs every registered runtime against the `blank` and `all-plugins`
  shapes.

- [#2212](https://github.com/withplumix/plumix/pull/2212) [`ae47e39`](https://github.com/withplumix/plumix/commit/ae47e397b7c0b4ce56f334c47514a215e4eb9da3) Thanks [@nasyrov](https://github.com/nasyrov)! - Adds a runtime-neutral e2e harness to `plumix/test/playwright`. `definePlumixE2EConfig` takes `configDir` (pass `import.meta.dirname`) beside `playground`, reads the `plumix.e2e` block of the runtime package the playground depends on for the state to wipe and where the database lives, and applies migrations through `plumix migrate apply` instead of naming wrangler; `openPlaygroundDb` resolves the database through the same block and drops its unused `binding` option. Adds `runtimeSpec`, the one spec every runtime playground runs (bootstrap the first admin with a passkey, publish an entry, read it publicly, upload media, sign out), plus the `CONTENT_LIST_ROWS` and `PNG_1X1` fixtures the plugin suites share. The Cloudflare runtime declares its block and ships a playground that runs the spec.

## 0.10.0

### Minor Changes

- [#2180](https://github.com/withplumix/plumix/pull/2180) [`a8a0d56`](https://github.com/withplumix/plumix/commit/a8a0d5697b8b918421d8644cf9358044abb3bc88) Thanks [@nasyrov](https://github.com/nasyrov)! - Moves entry generation onto the runtime adapter. `RuntimeAdapter` gains a
  required `generateEntry({ configModule })` returning the source of the module
  the build serves — the few lines that adapt a platform's serve API to
  `PlumixHandler`, which is a module-worker `export default` on Cloudflare and
  something else everywhere else. The plumix Vite plugin's pre-emit step asks the
  config's runtime adapter for that source when it writes `.plumix/worker.ts`.

  Removes `generateWorkerSource` and `WorkerSourceOptions` from `@plumix/core`, so
  core no longer dictates one platform's export shape for every runtime. A custom
  runtime adapter, or a wrapper such as the demo runtime, must supply
  `generateEntry`. The Cloudflare adapter emits byte-for-byte what core emitted
  before — the default export with `fetch` and `scheduled`, the asset-manifest and
  worker-exports virtual imports, the dev boot-error branch, one memoised handler,
  and the positional Worker arguments forwarded into an invocation — so a
  Cloudflare site builds, deploys and serves exactly as before.

- [#2196](https://github.com/withplumix/plumix/pull/2196) [`a8ab8e2`](https://github.com/withplumix/plumix/commit/a8ab8e281ce356a5df43872ea33d5e062f9b40e5) Thanks [@nasyrov](https://github.com/nasyrov)! - Publish the CLI command-authoring surface on its own subpath, `plumix/cli` (and `@plumix/core/cli` behind it): `CliError`, `isCliError`, `spawnInherit` and `spawnCapturingStderr`, the pieces a runtime adapter needs to contribute a command.

  The `plumix` binary previously loaded core's root barrel before parsing a flag — ~500ms of drizzle, schema and auth — for a single symbol, `buildApp`, that a command declaring `deferApp` never calls. `buildApp` is now deferred, and `plumix --version` runs in 93ms against 586ms before.

  Commands that read `plumix.config.ts` are unchanged, because loading the config pulls the runtime adapter and so core with it.

  `@plumix/runtime-cloudflare` now imports `plumix/cli`, so its `plumix` peer floor moves to `>=0.21.0` — the first version that publishes the subpath. Without that, the wide `0.x` peer range would let the new adapter install against a `plumix` that cannot resolve it, and `deploy`, `migrate apply` and `types` would fail at runtime.

- [#2176](https://github.com/withplumix/plumix/pull/2176) [`c2dea58`](https://github.com/withplumix/plumix/commit/c2dea582d430e025f493daec2b6e3a38520d8ec4) Thanks [@nasyrov](https://github.com/nasyrov)! - Replaces the positional runtime handler contract with one handler object per
  adapter. A runtime adapter now exposes `createHandler(app)` and returns a
  `PlumixHandler` whose `fetch(request, invocation)` takes a standard `Request`
  plus a single `Invocation` (`env`, optional `waitUntil`, optional
  `clientAddress`) and whose optional `scheduled(event, invocation)` runs the
  registered scheduled tasks. Core exports `createPlumixHandler`, the default
  handler factory that assembles the app context, validates required bindings
  once per handler, wires the request-scoped database and its commit step, and
  runs the scheduled loop; the Cloudflare adapter is built on it and adds only
  the `ASSETS` binding read. The generated Worker entry forwards its positional
  `(request, env, ctx)` arguments into an invocation.

  Removes `FetchHandler`, `ScheduledHandler`, `buildFetchHandler` and
  `buildScheduledHandler`. A custom runtime adapter or a wrapper such as the
  demo runtime implements `createHandler` instead. The missing-bindings 500 keeps
  its `bindings_missing` code and `missing` list; its message no longer names
  wrangler, since the check now lives in core, and the handler's failure log
  lines are tagged `[plumix]` rather than `[plumix/runtime-cloudflare]`. A Cloudflare site serves, gates
  RPC, validates bindings and runs cron exactly as before.

- [#2182](https://github.com/withplumix/plumix/pull/2182) [`20c238d`](https://github.com/withplumix/plumix/commit/20c238dd0d6f6f8b1fe0bda93872461d6ab3117f) Thanks [@nasyrov](https://github.com/nasyrov)! - Adds `plumix/storage/s3`: an `s3()` object-storage slot that talks to any S3-compatible
  bucket — AWS S3, R2 through its S3 API, MinIO, DigitalOcean Spaces, GCS interop — over
  `fetch` with a hand-rolled SigV4 signer and no AWS SDK. Config takes `bucket`, `region`,
  `endpoint`, `credentials` (a literal or an `(env) => …` resolver read from the handler's
  env) and an optional `publicUrlBase`. The slot satisfies the object-storage port in full,
  `presignPut` included, and is proven by the conformance suite against an in-memory S3 that
  recomputes every signature the way a real bucket does.

  The signer ships beside it in both forms: `presignPutUrl` for query-string presigning and
  `signRequest` for `Authorization`-header signing, each carrying an STS session token when
  the credentials have one. A subpath rather than the root barrel, so a bundle that binds a
  native bucket never carries the signer — the route `plumix/db/libsql` took for its driver.

  `@plumix/runtime-cloudflare`'s `r2()` keeps its native-binding path and mints presigned
  PUTs through the core signer; the package no longer holds a signer of its own.

- [#2183](https://github.com/withplumix/plumix/pull/2183) [`27aa310`](https://github.com/withplumix/plumix/commit/27aa310171a1e44b8ebd5ae9f6b6ff42ae622efe) Thanks [@nasyrov](https://github.com/nasyrov)! - Binds every capability slot once per handler instead of once per request. The
  `storage:`, `kv:`, `cache:` and `imageDelivery:` slots are connected against the
  first invocation's `env` and the bound instances are reused for the handler's
  life, which is the isolate-stability assumption binding validation and
  `resolveEnvInput` already rely on. A slot author on a process runtime no longer
  has to memoise a Redis client or an S3 signer by hand; the libsql adapter's
  private client memo is gone for that reason.

  The database keeps `connectRequest` as its only per-request seam. Its `connect`
  is called once and reused when there is no hook or the hook returns `null`, so
  D1's Sessions API still attaches a bookmark to every response.

  `connect(env: unknown)` becomes `connect(env: PlumixEnv)` on every port, and
  `RequestScopedDbArgs.env` with it, so a slot author augments one interface for
  their runtime and reads it type-checked. `memoryKv()` and `memoryStorage()` bind
  against nothing, so their `env` argument is now optional: a consumer whose
  `PlumixEnv` is augmented can call `connect()` rather than synthesizing a bag to
  stand a store up in a test. A database adapter that read the `request` argument
  of `connect` must move that read to `connectRequest`, which is the argument that
  is still per request. `requiredBindings` validation is unchanged.

- [#2186](https://github.com/withplumix/plumix/pull/2186) [`28efa5b`](https://github.com/withplumix/plumix/commit/28efa5be00ef6e40bc0bbf1b3813677c2a597de0) Thanks [@nasyrov](https://github.com/nasyrov)! - Makes the client address a fact the runtime supplies rather than one core
  guesses from a header. `invocation.clientAddress` lands on the app context as
  `ctx.clientAddress`, so a plugin writing a rate limiter or a spam floor reads
  one field whatever the site deploys on. Session-metadata capture and
  `readVisitorMeta`'s per-visitor hashing both read it from there, and the two
  header-parsing readers in core are gone: core never looks at
  `cf-connecting-ip`, `x-forwarded-for` or any other proxy header again.

  The Cloudflare adapter supplies `cf-connecting-ip`, the one forwarding header
  its edge overwrites, so a Cloudflare site records exactly what it recorded
  before. On a runtime that reports no address a session row stores none and
  every such visitor shares one hashed bucket, rather than a visitor buying a
  fresh bucket by setting a header of their own.

  `readVisitorMeta` loses its `request` argument, since both halves of what it
  reports now come off the context: `readVisitorMeta(ctx, { namespace })` reads
  the address from `ctx.clientAddress` and the user-agent from `ctx.request`.
  Drop the middle argument at each call site and rebuild — a plugin still
  compiled against the three-argument form now throws naming the fix, rather
  than silently hashing into a shared salt group.

  `createDispatcherHarness` from `plumix/test` gains a `clientAddress` option so
  a test sets the fact directly instead of forging a header.

### Patch Changes

- [#2175](https://github.com/withplumix/plumix/pull/2175) [`acbcae6`](https://github.com/withplumix/plumix/commit/acbcae699c69c1e90c281265728efc6a8d69687b) Thanks [@nasyrov](https://github.com/nasyrov)! - Removes the last single-runtime leanings that don't depend on the new handler
  contract. The audit-log cursor now encodes with Web APIs instead of Node's
  `Buffer`; core's dead, unused `node:fs` catalog loader is gone; the
  undeclared-binding dev-error hint is registered by `@plumix/runtime-cloudflare`
  instead of core, so it no longer appears on non-Cloudflare deploys; and
  scheduled-task cron docstrings describe the runtime as responsible for firing
  the schedule instead of naming `wrangler` configuration.

## 0.9.1

### Patch Changes

- [#2139](https://github.com/withplumix/plumix/pull/2139) [`f8f2d9d`](https://github.com/withplumix/plumix/commit/f8f2d9d128da81db7383e15b550232196a4bcc95) Thanks [@nasyrov](https://github.com/nasyrov)! - Adds an entry change feed — a durable record of which entries changed.

  Nothing recorded which entries had changed. A consumer that needs to know could only subscribe to
  the `entry:*` lifecycle actions, which miss every write that bypasses the application: seeds,
  migrations, direct-write tooling, bulk imports. An `entry_changes` table now carries one row per
  change, appended by triggers on `entries` so no writer can bypass it. Only a change to title,
  content, excerpt or status enqueues, so a metadata-only save records nothing; a deletion enqueues a
  tombstone, because the entry it names is gone by the time a consumer reads it.

  `readEntryChanges(db, limit)` returns the oldest pending changes and `ackEntryChanges(db, changes)`
  drops the ones a consumer has finished with. Both accesses are primary-key ordered, so draining
  tracks the batch rather than the corpus, and acknowledging after the work rather than before leaves
  an isolate that dies mid-drain its batch for the next one. Nothing in core drains the feed yet —
  the first consumer is the search plugin.

  `plumix migrate generate` emits core's DDL ahead of every plugin's, since the objects it creates sit
  on core's own tables. The demo sandbox's statement splitter now keeps a trigger body whole: it split
  on every semicolon outside a quoted span, which would have cut the first trigger to reach it into
  fragments.

## 0.9.0

### Minor Changes

- [#1978](https://github.com/withplumix/plumix/pull/1978) [`d4f1001`](https://github.com/withplumix/plumix/commit/d4f10014d60ec42ee40afbe12217b6e0cd810690) Thanks [@nasyrov](https://github.com/nasyrov)! - Adds an edge-cache opt-in for plugin routes: `registerRoute({ cacheable: true })` serves a public
  raw route through the edge cache instead of running its handler on every request. A response that
  sets its own `Cache-Control` now keeps that freshness through storage — an immutable
  content-addressed asset stays immutable — and the configured page TTL applies only to responses
  that set none.

## 0.8.2

### Patch Changes

- [#1951](https://github.com/withplumix/plumix/pull/1951) [`c1ec341`](https://github.com/withplumix/plumix/commit/c1ec3414dff6abf261306e966c7f573277bf3a33) Thanks [@nasyrov](https://github.com/nasyrov)! - `cloudflareDeployOrigin` now resolves the deployed origin on a Cloudflare
  Workers Builds deploy instead of falling back to localhost on every one of
  them. It read `WORKERS_CI` and `WORKERS_CI_BRANCH` through a local view of
  `process.env`, which the Plumix Vite plugin's `define` — a literal
  member-expression substitution — passed by, so the read survived into the
  bundle and ran inside the Worker isolate, whose `process.env` carries
  bindings and never those names. Every deploy returned `rpId: "localhost"`
  before `productionOrigin` or `accountSubdomain` was read, and the browser
  refused every passkey ceremony on the deployed host. Both names are now read
  as the literal member expressions the substitution rewrites.

## 0.8.1

### Patch Changes

- [#1897](https://github.com/withplumix/plumix/pull/1897) [`5fbb8cf`](https://github.com/withplumix/plumix/commit/5fbb8cf6faa061554f32c4f3ca490be03449a3d4) Thanks [@nasyrov](https://github.com/nasyrov)! - Types the stored block tree and the plugin dictionaries that describe serialized data with the public `JsonObject` / `JsonValue` types.

  **Source-breaking for block and theme authors** on the type level only — the emitted JS is unchanged. `BlockNode` is now a `type` alias rather than an `interface`, and its `attrs` is a `JsonObject`; the same goes for `BlockVariation.attrs`, `BlockSpec.defaults`, a transform's `mapAttrs`, a block loader's `attrs`, and `ResponsiveStyleSlot` / `VisibilityFlags`. A node built from a `Record<string, unknown>` no longer assigns, and an entry added to `BlockTypeRegistry` has to be spelled as a `type` over an object literal — TypeScript withholds the implicit index signature an `interface` would need.

  What a block's `render` receives is deliberately _not_ JSON and is now named and exported: `MaterializedAttrs` is the stored bag with each slot key replaced by the component that renders that slot's children. `BlockNodeRenderProps`, `BlockNodeComponent` and `BlockSpec` default their `Attrs` parameter to it.

  **Source-breaking for the editor's plugin-field seam.** `@plumix/admin-editor`'s `PluginFieldControlProps` now types `rhf.onChange` as `(next: JsonValue) => void` and the sibling block `attrs` as a `JsonObject`; `rhf.value` stays `unknown`, because the same controls also serve metaboxes, where RHF hands over a live `Date` for a temporal field. The `registerPluginFieldType` registry contract itself is unchanged.

  `@plumix/plugin-audit-log` holds a caller's own `properties` to JSON: `ctx.audit.log({ properties })` and an event definition's `extra` return no longer accept a `Date`, which reached storage as an ISO string anyway. The row's stored envelope stays open — its diff half is built from live entity columns.

  Island props keep their open type — the prop codec encodes `Date`, `Map`, `Set`, `BigInt`, `URL` and the typed arrays so they survive hydration, which a JSON type would deny.

  `@plumix/runtime-cloudflare` types the CF Access JWT payload as jose's `JWTPayload` instead of a loose dictionary.

## 0.8.0

### Minor Changes

- [#1782](https://github.com/withplumix/plumix/pull/1782) [`4155a46`](https://github.com/withplumix/plumix/commit/4155a467dcd5e358d3c335849943e7683fc804cd) Thanks [@nasyrov](https://github.com/nasyrov)! - Turn the `kv` slot into a working key/value store.

  The `kv` config slot was previously a marker interface with no methods —
  accepted in config but never usable at runtime. It now carries a real
  `ConnectedKv` contract (`get` / `put` with `expirationTtl` / `delete` / `list`
  with prefix + cursor pagination), exposed on the request context as `ctx.kv`
  and traced like the `storage` and `cache` slots.

  `@plumix/core` ships `memoryKv()`, a backend-agnostic in-memory adapter for dev
  and tests (string values, a 1..1000 list page cap; no backend-specific TTL
  floor). `@plumix/runtime-cloudflare`'s `kv({ binding })` binds a Workers KV
  namespace and implements the same contract. The port is deliberately
  runtime-neutral — a Node runtime over Redis would implement the same `KV`
  interface.

  Usage:

  ```ts
  import { kv } from "@plumix/runtime-cloudflare";

  plumix({
    kv: kv({ binding: "SESSIONS" }),
    // ...
  });

  // in a plugin handler:
  await ctx.kv?.put("key", "value", { expirationTtl: 3600 });
  const value = await ctx.kv?.get("key");
  ```

  `create-plumix-app` gains a `kv` scaffold capability for the Cloudflare runtime:
  a plugin that requires `kv` now automatically wires `kv({ binding: "KV" })` and a
  `KV` namespace binding into the generated `wrangler.jsonc`.

## 0.7.0

### Minor Changes

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
