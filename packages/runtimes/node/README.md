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

### `createRequestListener(handle, { trustProxy, bodySizeLimit })`

The `node:http` bridge the production entry and the dev server share. Each request becomes a `Request` with a streamed body, an `AbortSignal` that fires when the client disconnects, and a URL built from the socket's scheme and the `Host` header (the bound port fills in when `Host` is absent). Forwarding headers are ignored unless `trustProxy` is on; then `x-forwarded-proto`, `x-forwarded-host` and the rightmost `x-forwarded-for` entry win, and the handler receives that address. A body over `bodySizeLimit` (1 GiB by default) fails when the handler consumes it. A path `decodeURI` rejects, a `Host` the URL parser refuses, or a method `fetch` forbids answers 400; a body the handler leaves unread is drained after the response so the connection stays usable.

### `createAssetsLayer({ root })`

The disk layer over `dist/client`. `serve(req, res, next)` answers a held GET or HEAD before the handler runs; `fetch(request)` is the assets binding core reads for admin deep links, answering 404 for a path it does not hold. Paths that escape the root, name a directory without a trailing slash, or touch a dotfile other than `.well-known` are never held. Files under `/assets/` carry an immutable cache header, set only once the file has opened.

## Commands

The `./commands` subpath registers the runtime's CLI commands with `plumix`:

- `plumix migrate apply` — applies the migrations `plumix migrate generate` wrote to `drizzle/` to the file `nodeSqlite()` names. Drizzle records what it applied in `__drizzle_migrations`; a database is not portable between runtimes by copying the file.

## License

MIT
