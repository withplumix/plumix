# @plumix/runtime-bun

The **Bun runtime** for Plumix — run a site on Bun, using what Bun ships: `bun:sqlite` for the database, so nothing native is installed.

Bun 1.4 or newer. Every command runs on Bun: `bun --bun plumix …`.

## Install

```bash
bun add @plumix/runtime-bun
```

## Usage

```ts
import { plumix } from "plumix";

import { bunSqlite } from "@plumix/runtime-bun";

export default plumix({
  database: bunSqlite({ path: "data/site.sqlite" }),
  // …
});
```

### `bunSqlite({ path })`

Opens the SQLite file at `path` (parent directories are created) with WAL journaling, a 5 second busy timeout, `synchronous = NORMAL`, and foreign keys on — Bun's own defaults differ on all four, so each is set on connect. A relative `path` resolves against the project root, in the server and in `plumix migrate apply` alike. One file, one process: for a remote or shared database use `plumix/db/libsql` instead.

### `plumix migrate apply`

```bash
bun --bun plumix migrate generate
bun --bun plumix migrate apply
```

Applies the migrations `plumix migrate generate` wrote to `drizzle/` to the `bunSqlite()` file, with the same pragmas. Its migrations table is drizzle's, so the file is portable between Bun and the Node runtime. Run under Node, the command stops with `bun_required` and names `bun --bun` as the fix.
