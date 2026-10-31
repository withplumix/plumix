# @plumix/runtime-node

## 0.5.1

### Patch Changes

- [#3228](https://github.com/withplumix/plumix/pull/3228) [`4bc3649`](https://github.com/withplumix/plumix/commit/4bc36492cda3c6f3d331eece0735de1ad9fc3eee) Thanks [@nasyrov](https://github.com/nasyrov)! - Raises dependency floors: `drizzle-orm` to 0.45.4 and `@tanstack/react-query` to 5.104.2 / `@tanstack/react-router` to 1.170.42 in the framework, the runtimes and the first-party plugins, `@lingui/core` and `@lingui/react` to 6.9.1, the `@orpc/*` packages to 1.15.6, `react-hook-form` to 7.90.0, `vitest` to 5.0.4 and `@playwright/test` to 1.64.0 in the framework, `vite` to 8.3.4 in the framework and the runtimes, and the Cloudflare toolchain (`@cloudflare/vite-plugin` 1.63.1, `wrangler` 4.149) in `@plumix/runtime-cloudflare`.

- [#3409](https://github.com/withplumix/plumix/pull/3409) [`d1f437d`](https://github.com/withplumix/plumix/commit/d1f437d57c4240b826f4b867b8f53680678aee0b) Thanks [@nasyrov](https://github.com/nasyrov)! - Aborts a running scheduled task's `ctx.signal` when the site shuts down, so a task that checks it stops between batches instead of being cut off at exit.

- [#3479](https://github.com/withplumix/plumix/pull/3479) [`d75c0a0`](https://github.com/withplumix/plumix/commit/d75c0a096aa11af62e293f792e6087694e052b75) Thanks [@nasyrov](https://github.com/nasyrov)! - Fixes block strings, mails, the welcome screen and the admin bar rendering in English on a site that enables a regional locale: the generated server entry now hands core the closest catalog for each enabled locale, which `plumix build` works out. Upgrade `plumix` with the adapter.

## 0.5.0

### Minor Changes

- [#3190](https://github.com/withplumix/plumix/pull/3190) [`e77d19d`](https://github.com/withplumix/plumix/commit/e77d19d6f9c5d6a49a79781e4de7d94f94180490) Thanks [@nasyrov](https://github.com/nasyrov)! - Fixes `plumix meta report` and `plumix meta settle` on Cloudflare. They reach the local D1 that `plumix dev` uses, or the deployed one `--production`, `--preview` or `--env <name>` names, with `--binding` when there are several, the same as `plumix migrate`. A settle against a deployed database prints what it would settle and asks first; `--yes` skips the question and `--dry-run` stops after the plan. Removes the admin's **Management → Field values** page and the `meta.sweep` RPC it called: run `plumix meta settle` instead. Opening an entry, term or user still converts its own values. Adds `openRun` to a runtime adapter's `RuntimeMigrations`, which returns the env `plumix meta` runs the site's handler in, so upgrade `plumix` and the runtime adapter together. Adds `describeRunContract` to `plumix/test/conformance`, which holds an adapter's `openRun` to what `plumix meta` does.

- [#3183](https://github.com/withplumix/plumix/pull/3183) [`309a3c8`](https://github.com/withplumix/plumix/commit/309a3c86abd4343dea0bbaa319886c5486de8b61) Thanks [@nasyrov](https://github.com/nasyrov)! - Requires `plumix` 0.26 and its `plumix migrate` contract: `plumix migrate` prints the database file it opens first, and a target option such as `--production` fails naming the Node runtime.

- [#3188](https://github.com/withplumix/plumix/pull/3188) [`8108139`](https://github.com/withplumix/plumix/commit/8108139c2ff526b1c83f9e1053fc885d4f59c56a) Thanks [@nasyrov](https://github.com/nasyrov)! - Makes `plumix migrate fresh` on Node drop every table in the SQLite file `nodeSqlite()` names, with foreign keys off, instead of deleting the `data` folder.

- [#3202](https://github.com/withplumix/plumix/pull/3202) [`c592645`](https://github.com/withplumix/plumix/commit/c5926456087f569361ca090df37ed348053039b2) Thanks [@nasyrov](https://github.com/nasyrov)! - Adds `plumix sync` and `plumix import` on Node: the local end reads and writes the `nodeSqlite()` file and the storage slot, and the remote end reaches the deployed site's sync routes with an API token. A push snapshots the deployed database file with `VACUUM INTO` and prints the copy's path and the command that restores it.

### Patch Changes

- [#3186](https://github.com/withplumix/plumix/pull/3186) [`71061a0`](https://github.com/withplumix/plumix/commit/71061a07a7bbafdc2e00063a9701c1792486f0ab) Thanks [@nasyrov](https://github.com/nasyrov)! - Requires `plumix` 0.26.0 or later: the `dev` and `build` commands load their dependencies through `loadOnce` from `plumix/support`.

## 0.4.0

### Minor Changes

- [#3110](https://github.com/withplumix/plumix/pull/3110) [`0470908`](https://github.com/withplumix/plumix/commit/047090819ead6db3d67ad4ae18979eb230890497) Thanks [@nasyrov](https://github.com/nasyrov)! - Adds data migrations: forward-only TypeScript steps built with `defineDataMigration` from `plumix/db`, which core, a plugin (through `dataMigrations` on its descriptor, with or without tables) or the site (through `dataMigrations` in `plumix.config.ts`) declare. They run after every schema migration in `plumix dev`, `plumix migrate`, `plumix deploy` and a built Node or Bun server's start, are recorded per owner and name in `__plumix_data_migrations`, and show in `plumix migrate status`. `plumix build` on Node and Bun writes them to `dist/server/migrations/data-migrations.js`, beside the server and outside it. Each runtime's `MigrationDatabase` now carries `drizzle`.

- [#3070](https://github.com/withplumix/plumix/pull/3070) [`d0ecdab`](https://github.com/withplumix/plumix/commit/d0ecdab09b9b9cb7bb6f3c9aacfee470fb6dd2ab) Thanks [@nasyrov](https://github.com/nasyrov)! - Writes each line Plumix logs to stdout as one JSON object (`level`, `message`, `time`, the call's fields, and errors with their stack) from a built server, so a log drain or journald can parse it. `plumix dev` keeps its readable output, and `plumix doctor` reports where the logs go.

- [#2959](https://github.com/withplumix/plumix/pull/2959) [`46ce5f4`](https://github.com/withplumix/plumix/commit/46ce5f4246df6180e22005928cdb9a6e0915f9ce) Thanks [@nasyrov](https://github.com/nasyrov)! - Supports the new `plumix migrate`, which applies core's and each plugin's shipped migrations, and removes `plumix migrate apply`. On Cloudflare it opens the site's D1 binding through wrangler's `getPlatformProxy`: the local database `plumix dev` uses, or the deployed one with `--remote`. Pass `--binding <name>` when the wrangler config declares several D1 databases. It no longer runs `wrangler d1 migrations apply`, so `migrations_dir` is no longer needed. On Node and Bun it opens the configured SQLite file, and `--remote` is an error. The Bun scaffold's `migrate:apply` script is now `migrate`.

- [#3068](https://github.com/withplumix/plumix/pull/3068) [`12be633`](https://github.com/withplumix/plumix/commit/12be6334be5c20ed2d0837310c927be182f46468) Thanks [@nasyrov](https://github.com/nasyrov)! - Applies migrations where the site runs. On Cloudflare, `plumix deploy` applies every pending migration to the remote D1 before it runs `wrangler deploy`, and a failed apply stops the deploy; on Workers Builds, set the deploy command to `npx plumix deploy`. Without `--binding`, migrations open the D1 binding the config's `d1()` slot names, so a wrangler config with several D1 databases needs no flag. The built Node and Bun servers apply the migrations their build shipped to their SQLite file before they listen, and exit 1 without listening when that fails. `serveWhenMain` on Node and `serveProcess` on Bun now return a promise, and `createBunSite` returns a `migrate` member. The Bun SQLite connection sets its busy timeout before switching to WAL, so a server starting while another migrates the same file waits instead of failing.

### Patch Changes

- [#2912](https://github.com/withplumix/plumix/pull/2912) [`3f338ee`](https://github.com/withplumix/plumix/commit/3f338ee01f03ad50f98c90faddd89e9c517ab814) Thanks [@nasyrov](https://github.com/nasyrov)! - Raises dependency floors: `@modelcontextprotocol/sdk` to 1.31.0 and `@lingui/*` to 6.8.0 in the framework, `smol-toml` to 1.9.0 and the Cloudflare toolchain (`@cloudflare/vite-plugin` 1.62, `wrangler` 4.143) in `@plumix/runtime-cloudflare`, and the optional `sharp` peer to 0.35.5 in `@plumix/runtime-node`.

- [#3034](https://github.com/withplumix/plumix/pull/3034) [`fbd829d`](https://github.com/withplumix/plumix/commit/fbd829d5a349a97c3abba7214dbf9bbb2fff5552) Thanks [@nasyrov](https://github.com/nasyrov)! - Raises dependency floors: `@tanstack/react-query` to 5.104.1 and `@tanstack/react-router` to 1.170.41 in the framework and the first-party plugins, `@lingui/core` and `@lingui/react` to 6.9.0, the editor's `@tiptap/*` packages to 3.31.4 and `@modelcontextprotocol/sdk` to 1.32.0 in the framework, `vite` to 8.3.2 in the framework and the runtimes, and the Cloudflare toolchain (`@cloudflare/vite-plugin` 1.62.5, `wrangler` 4.147) in `@plumix/runtime-cloudflare`.

- [#3127](https://github.com/withplumix/plumix/pull/3127) [`4559226`](https://github.com/withplumix/plumix/commit/45592269fede4b4cdc5afab462da02b0d9c15fb2) Thanks [@nasyrov](https://github.com/nasyrov)! - Raises dependency floors: `vite` to 8.3.3 in the framework and the runtimes, and `sanitize-html` to 2.18.0 and `@modelcontextprotocol/sdk` to 1.32.1 in the framework.

## 0.3.0

### Minor Changes

- [#2718](https://github.com/withplumix/plumix/pull/2718) [`3ae979f`](https://github.com/withplumix/plumix/commit/3ae979fa04c199682dfbb27cd5fd847e7a875208) Thanks [@nasyrov](https://github.com/nasyrov)! - Loads `.env` in production. The built server reads `.env` from the directory it starts in, before the site is built, and fills only the keys the environment has not set, so a platform's injected secrets always win; a missing file is not an error. A deploy that relied on a `.env` beside the server being ignored should remove the file or move its values into the environment. `.env` is now the one env file on every runtime: a project keeping local secrets in `.dev.vars` should rename it to `.env`.

- [#2632](https://github.com/withplumix/plumix/pull/2632) [`ebcc400`](https://github.com/withplumix/plumix/commit/ebcc400aa517b7cfd7e8d6076cac2c063e046091) Thanks [@nasyrov](https://github.com/nasyrov)! - Passes each installed plugin's compiled catalogs to the app from the generated entry, so plugin block strings render in the request's locale. `createNodeSite` accepts a matching `pluginCatalogs` option.

- [#2759](https://github.com/withplumix/plumix/pull/2759) [`567a0cf`](https://github.com/withplumix/plumix/commit/567a0cf65e2561c9c8697c4e12d9e8f8e617a35f) Thanks [@nasyrov](https://github.com/nasyrov)! - Moves the Node adapter to the `handler` spec, and has the site build its handler with `createRuntimeHandler(app)`. Assets and the drain deadline behave as before. Requires the `plumix` release that adds `createRuntimeHandler`.

- [#2711](https://github.com/withplumix/plumix/pull/2711) [`943bd59`](https://github.com/withplumix/plumix/commit/943bd59807b020d116ece74f36bb50aec060df49) Thanks [@nasyrov](https://github.com/nasyrov)! - Requires `plumix` 0.24.0 or later, and applies the request trust and asset rules from `plumix/runtime` instead of its own copies. The rules behave the same. One exception: `createRequestListener` no longer infers `https` from a TLS socket. Mounted on `node:https`, it now builds `http://` URLs unless `trustProxy` is on and the request carries `x-forwarded-proto`.

- [#2619](https://github.com/withplumix/plumix/pull/2619) [`267b106`](https://github.com/withplumix/plumix/commit/267b10604410736ae9ff014224f8503f9701ded8) Thanks [@nasyrov](https://github.com/nasyrov)! - Removes `db` from `CronOverrides`, so `site.startCron()` no longer accepts a database. It was a test seam: the scheduler's run guard always writes to the site's own database. Drop the option from your call.

### Patch Changes

- [#2708](https://github.com/withplumix/plumix/pull/2708) [`26ecc04`](https://github.com/withplumix/plumix/commit/26ecc04bc17c5f45e672c6d58108d44594540265) Thanks [@nasyrov](https://github.com/nasyrov)! - Raises dependency floors: the optional `vitest` peer of `plumix/test` now requires `^5.0.1`. Also raises `vite` to `^8.3.0`, `drizzle-orm` to `^0.45.3`, `@orpc/*` to `^1.15.3`, `@tanstack/react-query` to `^5.103.2` and `@tanstack/react-router` to `^1.170.38`.

- [#2498](https://github.com/withplumix/plumix/pull/2498) [`0d0ed89`](https://github.com/withplumix/plumix/commit/0d0ed89d772b49d8f283bc5fd5d27ed08257e1cf) Thanks [@nasyrov](https://github.com/nasyrov)! - Imports each `plumix` value from the one subpath that publishes it (`plumix/theme`, `plumix/plugin`, `plumix/runtime`, `plumix/auth`, `plumix/support`), so this release requires `plumix` 0.24.0 or later.

- [#2743](https://github.com/withplumix/plumix/pull/2743) [`6c87e7e`](https://github.com/withplumix/plumix/commit/6c87e7e3db3edb67df4ff8f877a47d63d32af09f) Thanks [@nasyrov](https://github.com/nasyrov)! - Runs scheduled tasks on the scheduler `plumix/runtime` now ships instead of its own copy, and requires `plumix` 0.24.0 or later. `startScheduledRunner` and its options are unchanged.

- [#2712](https://github.com/withplumix/plumix/pull/2712) [`604764e`](https://github.com/withplumix/plumix/commit/604764e23cd0d587621517b2bee59b2363bce7bf) Thanks [@nasyrov](https://github.com/nasyrov)! - Runs `plumix dev` and `plumix build` through the shared `plumix/vite` command helpers, with unchanged behaviour, so this release requires `plumix` 0.24.0 or later.

- [#2717](https://github.com/withplumix/plumix/pull/2717) [`ba15370`](https://github.com/withplumix/plumix/commit/ba153702afecfb1f80f8c75cfee029a34d411a6c) Thanks [@nasyrov](https://github.com/nasyrov)! - Adds `start` to each runtime's `plumix.e2e` block, the command that serves its built output, and an optional `packageManager` to a runtime's scaffold block. The scaffold smoke reads both to install each runtime with its own package manager and to start every built server.

## 0.2.0

### Minor Changes

- [#2320](https://github.com/withplumix/plumix/pull/2320) [`41aee82`](https://github.com/withplumix/plumix/commit/41aee82275e5a3d0c462a04d38493727d35ee71e) Thanks [@nasyrov](https://github.com/nasyrov)! - Fixes scheduled-run failures going unreported on Node. The generated entry dropped `handler.scheduled`'s return, so the `ScheduledRunReport` the scheduler logs failures from never arrived: a task that threw under `cron: true` said nothing. The entry's orchestration — the portable `{ fetch, scheduled }` pair, the assets → images → site serve chain, the cron start and the shutdown protocol — now lives in `createNodeSite`, and the generated entry is imports and calls. `listener`, `startCron` and the default export keep their shapes. The entry also exports `dispose`, so a host embedding `listener` can drain the site on its own shutdown the way the standalone process does on `SIGTERM`. Also changed: the handler is now built on the first request or firing rather than when cron starts, so a process that starts cron and receives neither has nothing for `dispose()` to release.

- [#2320](https://github.com/withplumix/plumix/pull/2320) [`41aee82`](https://github.com/withplumix/plumix/commit/41aee82275e5a3d0c462a04d38493727d35ee71e) Thanks [@nasyrov](https://github.com/nasyrov)! - Bounds a Node shutdown by one deadline, as it was documented to be, and reports each piece of work that deadline cuts. `SIGTERM` gives the scheduler stop, the in-flight drain and the deferred-work drain a shared ten seconds — but the in-flight drain raced a fresh full ten rather than what was left, so a scheduler stop that took four seconds pushed the process to fourteen, past a grace period sized for ten. Every step now spends from the same clock.

  A scheduled run still going when the budget runs out is now reported. It used to be dropped silently, and the process could exit 0 even though the run guard never replays that minute; it now logs the cut run and exits 1, as it already did for cut responses and abandoned deferred work. Breaking for implementers: `Scheduler.stop()` now resolves a boolean — `false` when its budget ran out with a firing in flight, `true` otherwise — so an implementation or stub returning `Promise<void>` no longer type-checks. Each cut line names the budget, `the 10000ms shutdown budget ran out`, rather than implying one step had all of it.

### Patch Changes

- [#2334](https://github.com/withplumix/plumix/pull/2334) [`c5ab6da`](https://github.com/withplumix/plumix/commit/c5ab6da406f3419a985beb3a4c1525db7eae2c5d) Thanks [@nasyrov](https://github.com/nasyrov)! - Fixes `plumix dev` leaving a scheduler running when two reloads overlap. A request that arrived while an earlier reload was still importing started a second load, and whichever finished last took over, so the other load's scheduler kept firing against the app it was built for until the process exited. A load that a newer one overtook now stops its scheduler and hands the requests waiting on it to the newest site. One that fails no longer shows its error or forces a rebuild that tears down the site that just loaded.

- [#2331](https://github.com/withplumix/plumix/pull/2331) [`2cc2d0d`](https://github.com/withplumix/plumix/commit/2cc2d0d0385da349c38395090c02334a8198f16b) Thanks [@nasyrov](https://github.com/nasyrov)! - `plumix dev` now releases the database connection a replaced site's handler bound. Each edit that invalidated the entry built a new site and left the old handler's connection open. A reload now disposes the replaced site in the background: its deferred work finishes, then that connection closes.

- [#2333](https://github.com/withplumix/plumix/pull/2333) [`269cbfc`](https://github.com/withplumix/plumix/commit/269cbfc57507502d1e60c1c88721db837031c46b) Thanks [@nasyrov](https://github.com/nasyrov)! - `plumix dev` no longer leaks the scheduler's database connection on every reload. The scheduler that `startScheduledRunner` and `startCron` return now closes the connection it opened once `stop()` resolves `true`; a firing that `stop({ timeoutMs })` gave up on keeps it, since that firing may still write through it. `stop()` stays safe to call more than once, and a connection that fails to close is logged rather than failing the stop.

- [#2340](https://github.com/withplumix/plumix/pull/2340) [`25587dd`](https://github.com/withplumix/plumix/commit/25587ddad5754470ec0de14aa4f46f752865df8f) Thanks [@nasyrov](https://github.com/nasyrov)! - Widens `runScheduledTasks`, `scheduledTasksFor`, `declaredSchedules` and `connectScheduledDb`, and the `app` option of the Node runtime's `startScheduledRunner`, to accept any object carrying the app fields they read (`scheduledTasks`, or `schema` plus `config.database`) rather than a whole `PlumixApp`. Code passing a full app keeps working.

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
