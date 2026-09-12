# @plumix/runtime-node

## 0.2.0

### Minor Changes

- [#2320](https://github.com/withplumix/plumix/pull/2320) [`41aee82`](https://github.com/withplumix/plumix/commit/41aee82275e5a3d0c462a04d38493727d35ee71e) Thanks [@nasyrov](https://github.com/nasyrov)! - Fixes scheduled-run failures going unreported on Node. The generated entry dropped `handler.scheduled`'s return, so the `ScheduledRunReport` the scheduler logs failures from never arrived: a task that threw under `cron: true` said nothing. The entry's orchestration — the portable `{ fetch, scheduled }` pair, the assets → images → site serve chain, the cron start and the shutdown protocol — now lives in `createNodeSite`, and the generated entry is imports and calls. `listener`, `startCron` and the default export keep their shapes. The entry also exports `dispose`, so a host embedding `listener` can drain the site on its own shutdown the way the standalone process does on `SIGTERM`. Also changed: the handler is now built on the first request or firing rather than when cron starts, so a process that starts cron and receives neither has nothing for `dispose()` to release.

### Patch Changes

- [#2320](https://github.com/withplumix/plumix/pull/2320) [`41aee82`](https://github.com/withplumix/plumix/commit/41aee82275e5a3d0c462a04d38493727d35ee71e) Thanks [@nasyrov](https://github.com/nasyrov)! - Bounds a Node shutdown by one deadline, as it was documented to be. `SIGTERM` gives the scheduler stop, the in-flight drain and the deferred-work drain a shared ten seconds — but the in-flight drain raced a fresh full ten rather than what was left, so a scheduler stop that took four seconds pushed the process to fourteen, past a grace period sized for ten. Every step now spends from the same clock. The consequence runs the other way too: a scheduler stop that uses the whole budget now leaves the in-flight and deferred drains nothing, so a shutdown that used to exit 0 at fourteen seconds exits 1 at ten. The cut line now names the budget — `the 10000ms shutdown budget ran out` — rather than implying in-flight responses had all of it.

## 0.1.0

### Minor Changes

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

- [#2219](https://github.com/withplumix/plumix/pull/2219) [`7921de6`](https://github.com/withplumix/plumix/commit/7921de6cb20512e9674395adda14f3e2aab16854) Thanks [@nasyrov](https://github.com/nasyrov)! - Adds the `node()` runtime adapter and `plumix build` for Node. The adapter wraps core's handler and serves `dist/client` as the assets binding, so admin deep links resolve; `build` writes `dist/client` and `dist/server/worker.js`, client first, inlining everything but `sharp`, `better-sqlite3`, the libsql client family and whatever `build.external` names. The generated entry keeps the portable `{ fetch, scheduled }` default export, exports a Connect-style `listener` for embedding, and when run directly listens on `PORT` and `HOST`, drains deferred work on `SIGTERM` or `SIGINT`, and exits 1 after ten seconds naming what it abandoned.

- [#2218](https://github.com/withplumix/plumix/pull/2218) [`ed2029f`](https://github.com/withplumix/plumix/commit/ed2029fc172e1bd761201f157914a192426146e6) Thanks [@nasyrov](https://github.com/nasyrov)! - Adds the two pieces a Node process needs in front of the handler. `createRequestListener` bridges `node:http` into a fetch-shaped handler: a streamed request body with the size limit enforced as it streams, an abort signal tied to the client disconnecting, a URL from the socket's scheme and `Host` (with the bound port when `Host` is absent), forwarding headers honoured only under `trustProxy`, multi-value `Set-Cookie` restored on the way out, and a 400 for a path `decodeURI` rejects. `createAssetsLayer` serves the built client directory from disk, both as Connect-style middleware and as the assets binding core reads for admin deep links, refusing traversal, directories and dotfiles, and marking `/assets/` immutable only once the file has opened.

- [#2223](https://github.com/withplumix/plumix/pull/2223) [`fe4f7a4`](https://github.com/withplumix/plumix/commit/fe4f7a4daf4cd483e101000a214cadb56e341adb) Thanks [@nasyrov](https://github.com/nasyrov)! - Adds `plumix dev` for Node: one Vite server with the plumix plugin and a runnable `server` environment whose externals match the build. Vite's middlewares answer first and the last one bridges into the entry's `fetch`; an edit to the config, a theme or a plugin rebuilds the app on the next request, and a failing boot renders the dev boot-error page. A `.env` in the project root is applied to the process environment before the entry is imported and re-applied when it changes, with a variable the shell set winning; production loads nothing. Requests from a host other than loopback are refused unless `PLUMIX_DEV_ALLOW_REMOTE` is set. Accepts `--port` and `--host`.

- [#2221](https://github.com/withplumix/plumix/pull/2221) [`2559b15`](https://github.com/withplumix/plumix/commit/2559b15ed4282d27c6f0a32731121ce3c7c3f714) Thanks [@nasyrov](https://github.com/nasyrov)! - Adds `diskStorage({ dir })`, the object-storage slot on the filesystem: one file per key under `dir/objects/` with its content type and metadata beside it under `dir/meta/`, a traversal guard that refuses a key before touching disk, ranged reads, and a listing by prefix whose cursor is the last key served. `url()` is null, so the media plugin serves uploads through its own route. Single-node by design; `s3()` from `plumix/storage/s3` is the swap.

- [#2229](https://github.com/withplumix/plumix/pull/2229) [`4687c85`](https://github.com/withplumix/plumix/commit/4687c85a6456ced4de15a10f1b4ea052bcfb38b8) Thanks [@nasyrov](https://github.com/nasyrov)! - `images()` bounds its cache. `cacheSize` (1 GiB by default) caps the bytes under `cacheDir`; past it, the variant served longest ago is dropped, and a restart starts from the order the files were written in. Renders run at most one per core at a time, with the rest waiting, so a burst of first views cannot hold every source in memory together. The slot gains `purge(sourceUrl)`, which forgets every variant of one source whatever query it was requested with; the media plugin calls it when an item is trashed or deleted, so a variant no longer outlives its source's gating.

- [#2228](https://github.com/withplumix/plumix/pull/2228) [`f0cf852`](https://github.com/withplumix/plumix/commit/f0cf8528ae48a739af6faad780e1bc775f32804f) Thanks [@nasyrov](https://github.com/nasyrov)! - Adds `images({ widths, remotePatterns, cacheDir })`, the `imageDelivery` slot on Node. `url()` is URL math onto `/_plumix/image`, which the entry and `plumix dev` serve ahead of the site through `sharp`, an optional peer loaded in `connect` and named by a clear error when missing. A same-origin source is resolved through the site's own `fetch` as an anonymous GET, so the media plugin's gating applies; a remote source must match `remotePatterns`, every redirect is re-checked with ten hops at most, sources are capped at 32 MiB and fifteen seconds, and anything else is 400. Widths snap to the roster, quality is clamped, and the format is negotiated from `Accept` to AVIF, WebP or the source's own. Variants are cached on disk under a hash of the request with an immutable cache header and answer 304 on `If-None-Match`. The scaffold's Node `imageDelivery` capability wires `images()` and installs `sharp`, so the media plugin is offered on Node.

- [#2213](https://github.com/withplumix/plumix/pull/2213) [`4dbbce2`](https://github.com/withplumix/plumix/commit/4dbbce2004222de9ec7e86c96bc3087629c1f5e7) Thanks [@nasyrov](https://github.com/nasyrov)! - Adds the `@plumix/runtime-node` package with its first slot, `nodeSqlite({ path })`: the database over `node:sqlite` through a small better-sqlite3-shaped client plugged into drizzle's session, so nothing native is installed. The file opens with WAL, a 5 second busy timeout, `synchronous = NORMAL` and foreign keys on, and its parent directories are created. The `./commands` subpath contributes `plumix migrate apply`, which runs drizzle's migrator over the generated `drizzle/` directory against that file. The `node()` adapter, `dev` and `build` follow in later slices.

- [#2222](https://github.com/withplumix/plumix/pull/2222) [`301429d`](https://github.com/withplumix/plumix/commit/301429dabe61f705785b9ba394a4ed1f075a9cd7) Thanks [@nasyrov](https://github.com/nasyrov)! - `create-plumix-app --runtime node` scaffolds a site that runs as a plain Node.js process: `node()` as the runtime, `nodeSqlite` on a file under `data/`, `diskStorage` when a plugin needs the storage capability, `.env` as the secrets file with an `.env.example`, `data` ignored, and a literal localhost passkey origin with a comment to change it for production. A plugin needing a capability Node does not provide, such as media's image delivery, is refused by name. The default runtime stays `cloudflare`.

  The base skeleton now leaves three things to the runtime: the ambient type packages the tsconfig lists, the README's Deploy section, and what the `clean` script removes. The Cloudflare block declares all three, so its projects are unchanged.

- [#2232](https://github.com/withplumix/plumix/pull/2232) [`689a693`](https://github.com/withplumix/plumix/commit/689a693759c21c9e2c8d062db8d1c50771137fed) Thanks [@nasyrov](https://github.com/nasyrov)! - Queries through the `node:sqlite` shim now record `db: <kind>` spans, so a Node
  site's debug bar lists its SQL and telemetry consumers see the same query
  tree the libsql and D1 adapters produce. `traceDbQuerySync` is the new core
  helper behind it — the synchronous twin of `traceDbQuery`, for a driver whose
  statement API returns rows rather than a promise. `createTracedContext` gains a
  `dbSpans()` reader alongside its `dbQueryCount()`.

### Patch Changes

- [#2252](https://github.com/withplumix/plumix/pull/2252) [`c8a131b`](https://github.com/withplumix/plumix/commit/c8a131b199293766e5336bc94e1d945af3ec998e) Thanks [@nasyrov](https://github.com/nasyrov)! - The Node `images()` route now matches `basePath`: `ImageDelivery.connect()` receives the site's resolved base path so `url()` prefixes `/_plumix/image` the way every other outbound URL is prefixed, and the pre-handler layer matches requests against the same prefixed route. A site served under a subdirectory, behind a proxy that forwards only that subdirectory, now reaches the route.

  Two smaller gaps close alongside it: rendering passes `{ animated: true }` to `sharp`, so an animated GIF or WebP source keeps its frames through a resize instead of losing them to the first one; and `Accept` negotiation now parses `q` values instead of doing a substring match, so `image/avif;q=0` no longer selects AVIF.

- [#2224](https://github.com/withplumix/plumix/pull/2224) [`d7b3e92`](https://github.com/withplumix/plumix/commit/d7b3e92e8da37f6ae044a64484cb4e277ec6df8e) Thanks [@nasyrov](https://github.com/nasyrov)! - Declares the `plumix.e2e` block (`data/` wiped before a run, the database at `data/*.sqlite`) and ships a playground that runs the shared runtime spec through `plumix dev` — bootstrap, publish, public read, media upload, sign out — so Node and Cloudflare are proven by the same assertions. Adds the one case only Node has: an edit to the playground config while the server runs is served on the next request.

  `plumix dev` now serves the staged tree from disk ahead of Vite. Vite answers `publicDir` from a listing taken once at startup and repaired by watcher events, so an admin chunk staged after that listing could be missing from the set for the life of the server; Vite passed the request on, and the dispatcher answered an asset-shaped path at the root base with a 404 without ever reading the disk.

- [#2230](https://github.com/withplumix/plumix/pull/2230) [`e90ba2a`](https://github.com/withplumix/plumix/commit/e90ba2aaf78d24d7c8252035653d50406555326a) Thanks [@nasyrov](https://github.com/nasyrov)! - `nodeSqlite()` binds a boolean interpolated into a raw `sql` template as 0/1 and a `Date` as epoch milliseconds, the way libsql does. `node:sqlite` binds neither on its own, so a template that runs on `plumix/db/libsql` now runs on Node as well.

- [#2316](https://github.com/withplumix/plumix/pull/2316) [`72ff2ff`](https://github.com/withplumix/plumix/commit/72ff2ff1a10c47ef10e7736b7b73cf61473012dc) Thanks [@nasyrov](https://github.com/nasyrov)! - Trims the Node runtime's published surface before its first release. `IMAGE_ROUTE`, `createScheduler` and the wide `NodeImageDelivery` shape are no longer exported: each was reachable inside the package through a relative import and had no consumer outside it. `NodeImageDelivery` in particular published `sharp()`, the variant cache and the resolved config on top of what core's `ImageDelivery` port needs.

  Also corrects the README, which described the default export and `listener` as the same site. They do not serve the same paths: `listener` runs the assets and image layers ahead of the site, while the default export runs neither, so `/assets/*`, `/_plumix/image` and the admin's own `/_plumix/admin/assets/*` go unserved — a host mounting it gets the admin shell back, but its chunks 404.

- [#2258](https://github.com/withplumix/plumix/pull/2258) [`1348817`](https://github.com/withplumix/plumix/commit/13488173a6e7c9bd40a5d62eb18b327d408d27c9) Thanks [@nasyrov](https://github.com/nasyrov)! - Release the database connections a scheduled run opens

  `plumix cron run` opened database connections and never released them. A
  one-shot process exits only when its event loop drains and a remote libsql
  client holds a live socket until it is closed, so a Kubernetes CronJob pod could
  keep running long after its work finished — and with `concurrencyPolicy: Forbid`
  that blocks the next firing too.

  `DatabaseAdapter.connect` may now return a `close()` alongside its `db`, so a
  connection is released through the seam that created it. `nodeSqlite` and
  `plumix/db/libsql` provide one; D1 does not, having a binding rather than a
  connection. `createPlumixHandler` releases the connection it bound as part of
  `dispose()`, after the drain — deferred work is querying through it until then —
  and `plumix cron run` drains the handler and then releases the guard's own.

  The long-lived Node scheduler keeps its connection: the next firing uses it.

- [#2256](https://github.com/withplumix/plumix/pull/2256) [`2e28cd6`](https://github.com/withplumix/plumix/commit/2e28cd6b212633bace43a21e38b5497bbee73a42) Thanks [@nasyrov](https://github.com/nasyrov)! - Report scheduled-task failures instead of swallowing them

  A scheduled task that throws is caught so its siblings still run, which left
  every caller unable to tell a healthy run from one where everything failed.
  `plumix cron run` exited zero either way, so a Kubernetes CronJob's alerting
  never fired, and the in-process scheduler logged each task's error without ever
  saying the firing as a whole had not done its job.

  A firing now answers with a `ScheduledRunReport` — `{ ran, failed, aborted? }`.
  `runScheduledTasks` returns one and `PlumixHandler.scheduled` may resolve to
  one; an adapter that answers nothing still conforms, and its caller then knows
  only that the run was attempted. `plumix cron run` exits non-zero naming the
  tasks that failed, and the Node scheduler logs the same summary.

  `aborted` is separate from `failed` on purpose: a run that never reached its
  tasks — a missing binding, a database that will not connect — reports why,
  rather than naming a task that never started.

- [#2319](https://github.com/withplumix/plumix/pull/2319) [`6196720`](https://github.com/withplumix/plumix/commit/6196720c3b79f31a2463741cd0f776067b75ca79) Thanks [@nasyrov](https://github.com/nasyrov)! - Raises the `sharp` floor to `0.35.4`, which carries the libheif fixes for
  GHSA-g89c-p67h-r497 and GHSA-2jg2-4ch7-h545. `@plumix/runtime-node` declares
  `sharp` as an optional peer, so a project on `0.35.3` will see an unmet peer
  until it upgrades — that is the intended signal. Scaffolded projects that
  select the Node runtime's `imageDelivery` capability install the patched line
  from the start.
