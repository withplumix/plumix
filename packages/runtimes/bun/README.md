# @plumix/runtime-bun

The **Bun runtime** for Plumix — run a site on Bun, using what Bun ships: `Bun.serve` for HTTP, `Bun.file` for the built assets and `bun:sqlite` for the database, so nothing native is installed.

Bun 1.4 or newer. Every command runs on Bun: `bun --bun plumix …`.

## Install

```bash
bun add @plumix/runtime-bun
```

## Usage

```ts
import { plumix } from "plumix";

import { bun, bunSqlite } from "@plumix/runtime-bun";

export default plumix({
  runtime: bun(),
  database: bunSqlite({ path: "data/site.sqlite" }),
  // …
});
```

### `bun({ trustProxy?, bodySizeLimit?, idleTimeout? })`

- `trustProxy` — read the scheme, host and client address from `x-forwarded-proto`, `x-forwarded-host` and the rightmost `x-forwarded-for` entry. Off by default; turn it on only behind a TLS-terminating proxy, or a visitor can forge them.
- `bodySizeLimit` — bytes a request body may carry, 1 GiB by default. Bun answers 413 itself, before the site runs.
- `idleTimeout` — seconds a connection may sit idle, a pending response included; 30 by default, where Bun's own 10 would drop a slow render. `0` disables it; above 255, Bun's ceiling, `bun()` throws. An event stream (`text/event-stream`) is never cut by it.

### Build and run

```bash
bun --bun plumix build
bun dist/server/worker.js
```

The server listens on `PORT` (default 3000) and `HOST` (default `0.0.0.0`) and serves `dist/client` ahead of the site, hashed assets under `/assets/` as immutable. On `SIGTERM` or `SIGINT` it stops accepting connections, lets in-flight responses finish, drains deferred work and exits 0; after 10 seconds it cuts what is left and exits 1, naming it. A second signal exits at once.

Imported rather than run, `dist/server/worker.js` starts nothing and default-exports the portable `{ fetch, scheduled }`, to mount in a server of your own.

### `bunSqlite({ path })`

Opens the SQLite file at `path` (parent directories are created) with WAL journaling, a 5 second busy timeout, `synchronous = NORMAL`, and foreign keys on — Bun's own defaults differ on all four, so each is set on connect. A relative `path` resolves against the project root, in the server and in `plumix migrate apply` alike. One file, one process: for a remote or shared database use `plumix/db/libsql` instead.

### `plumix migrate apply`

```bash
bun --bun plumix migrate generate
bun --bun plumix migrate apply
```

Applies the migrations `plumix migrate generate` wrote to `drizzle/` to the `bunSqlite()` file, with the same pragmas. Its migrations table is drizzle's, so the file is portable between Bun and the Node runtime. Run under Node, the command stops with `bun_required` and names `bun --bun` as the fix.
