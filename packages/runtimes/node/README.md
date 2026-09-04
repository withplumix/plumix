# @plumix/runtime-node

The **Node.js runtime** for Plumix — run a site as an ordinary process, on a VM, in a container, or on any host that runs Node. It uses what Node ships: `node:sqlite` for the database, so `pnpm install` compiles nothing.

Node 24.2 or newer.

## Install

```bash
pnpm add @plumix/runtime-node
```

## Usage

```ts
import { auth, plumix } from "plumix";

import { nodeSqlite } from "@plumix/runtime-node";

export default plumix({
  database: nodeSqlite({ path: "data/site.sqlite" }),
  // …
});
```

### `nodeSqlite({ path })`

Opens the SQLite file at `path` (parent directories are created) with WAL journaling, a 5 second busy timeout, `synchronous = NORMAL`, and foreign keys on. A relative `path` resolves against the process working directory; `plumix migrate apply` resolves it against the project root (`--cwd`), so run the server from the same directory. One file, one process: for a remote or shared database use `plumix/db/libsql` instead.

## Commands

The `./commands` subpath registers the runtime's CLI commands with `plumix`:

- `plumix migrate apply` — applies the migrations `plumix migrate generate` wrote to `drizzle/` to the file `nodeSqlite()` names. Drizzle records what it applied in `__drizzle_migrations`; a database is not portable between runtimes by copying the file.

## License

MIT
