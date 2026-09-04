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

import { node, nodeSqlite } from "@plumix/runtime-node";

export default plumix({
  runtime: node(),
  database: nodeSqlite({ path: "data/site.sqlite" }),
  // …
});
```

### `node({ trustProxy, bodySizeLimit, build })`

The runtime adapter. `trustProxy` (off by default) makes the server read the scheme, host and client address a TLS-terminating proxy forwards; `bodySizeLimit` caps request bodies (1 GiB). `build.external` names packages the server bundle imports at runtime instead of inlining; `sharp`, `better-sqlite3` and the libsql client family are external without being listed.

`plumix build` writes `dist/client` for the browser and `dist/server/worker.js` to run:

```bash
PORT=3000 HOST=0.0.0.0 node dist/server/worker.js
```

The entry serves `dist/client` from disk ahead of the site, listens on `PORT` (3000) and `HOST` (`0.0.0.0`), and prints the bound address once. On `SIGTERM` or `SIGINT` it stops accepting, lets in-flight responses finish while deferred work drains, and exits 0; work still running after 10 seconds is abandoned and the process exits 1 saying how much. A second signal exits at once. Importing the module instead of running it starts no server: the default export is the portable `{ fetch, scheduled }` handler, and `listener(req, res)` is the same site as Connect-style middleware for embedding; it answers every request it receives, so mount it where the site should own the path.

### `nodeSqlite({ path })`

Opens the SQLite file at `path` (parent directories are created) with WAL journaling, a 5 second busy timeout, `synchronous = NORMAL`, and foreign keys on. A relative `path` resolves against the process working directory; `plumix migrate apply` resolves it against the project root (`--cwd`), so run the server from the same directory. One file, one process: for a remote or shared database use `plumix/db/libsql` instead.

### `createRequestListener(handle, { trustProxy, bodySizeLimit })`

The `node:http` bridge the production entry and the dev server share. Each request becomes a `Request` with a streamed body, an `AbortSignal` that fires when the client disconnects, and a URL built from the socket's scheme and the `Host` header (the bound port fills in when `Host` is absent). Forwarding headers are ignored unless `trustProxy` is on; then `x-forwarded-proto`, `x-forwarded-host` and the rightmost `x-forwarded-for` entry win, and the handler receives that address. A body over `bodySizeLimit` (1 GiB by default) fails when the handler consumes it. A path `decodeURI` rejects, a `Host` the URL parser refuses, or a method `fetch` forbids answers 400; a body the handler leaves unread is drained after the response so the connection stays usable.

### `createAssetsLayer({ root })`

The disk layer over `dist/client`. `serve(req, res, next)` answers a held GET or HEAD before the handler runs; `fetch(request)` is the assets binding core reads for admin deep links, answering 404 for a path it does not hold. Paths that escape the root, name a directory without a trailing slash, or touch a dotfile other than `.well-known` are never held. Files under `/assets/` carry an immutable cache header, set only once the file has opened.

## Commands

The `./commands` subpath registers the runtime's CLI commands with `plumix`:

- `plumix build` — the client and server bundles described above.
- `plumix migrate apply` — applies the migrations `plumix migrate generate` wrote to `drizzle/` to the file `nodeSqlite()` names. Drizzle records what it applied in `__drizzle_migrations`; a database is not portable between runtimes by copying the file.

## License

MIT
