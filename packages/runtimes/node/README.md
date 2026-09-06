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

The entry serves `dist/client` from disk, then image transforms, ahead of the site; it listens on `PORT` (3000) and `HOST` (`0.0.0.0`), and prints the bound address once. On `SIGTERM` or `SIGINT` it stops accepting, lets in-flight responses finish while deferred work drains, and exits 0; work still running after 10 seconds is abandoned and the process exits 1 saying how much. A second signal exits at once. Importing the module instead of running it starts no server: the default export is the portable `{ fetch, scheduled }` handler, and `listener(req, res)` is the same site as Connect-style middleware for embedding; it answers every request it receives, so mount it where the site should own the path.

### `nodeSqlite({ path })`

Opens the SQLite file at `path` (parent directories are created) with WAL journaling, a 5 second busy timeout, `synchronous = NORMAL`, and foreign keys on. A relative `path` resolves against the process working directory; `plumix migrate apply` resolves it against the project root (`--cwd`), so run the server from the same directory. One file, one process: for a remote or shared database use `plumix/db/libsql` instead.

### `images({ widths, remotePatterns, cacheDir, cacheSize })`

The image-delivery slot, backed by [`sharp`](https://sharp.pixelplumbing.com): install it beside the runtime (`pnpm add sharp`), and a site that leaves the slot out installs nothing native. `url()` is URL math onto `/_plumix/image`, which the entry serves ahead of the site. A same-origin source (`/_plumix/media/serve/1`, a file in `public/`) is resolved through the process itself, as an anonymous GET, so what the media plugin gates stays gated and nothing crosses the network; a remote source must match `remotePatterns` (the shape `images.remotePatterns` takes for `<Image>`), is fetched with each redirect re-checked and ten hops at most, and anything else is 400. A source over 32 MiB is refused, a remote that does not answer within 15 seconds is 502, and bytes `sharp` cannot decode are 415. A width snaps up to the next entry of `widths` (`320` to `1920` by default), quality is clamped, and the format comes from `Accept`: AVIF, WebP or the source's own. Each variant is rendered once and kept under `cacheDir` (`.cache/plumix/images`) under a hash of the request, served with an immutable cache header and an `ETag` that answers `If-None-Match` with 304. The directory holds at most `cacheSize` bytes (1 GiB by default), dropping the variant served longest ago past that, and as many renders run at once as the machine has cores. `purge(sourceUrl)` forgets every variant of one source, whatever query it was requested with; the media plugin calls it when an item is trashed or deleted, so a cached variant never outlives its source's gating.

```ts
import { diskStorage, images } from "@plumix/runtime-node";

export default plumix({
  storage: diskStorage({ dir: "data/media" }),
  imageDelivery: images({
    remotePatterns: [{ hostname: "images.example.com" }],
  }),
  // …
});
```

### `createRequestListener(handle, { trustProxy, bodySizeLimit })`

The `node:http` bridge the production entry and the dev server share. Each request becomes a `Request` with a streamed body, an `AbortSignal` that fires when the client disconnects, and a URL built from the socket's scheme and the `Host` header (the bound port fills in when `Host` is absent). Forwarding headers are ignored unless `trustProxy` is on; then `x-forwarded-proto`, `x-forwarded-host` and the rightmost `x-forwarded-for` entry win, and the handler receives that address. A body over `bodySizeLimit` (1 GiB by default) fails when the handler consumes it. A path `decodeURI` rejects, a `Host` the URL parser refuses, or a method `fetch` forbids answers 400; a body the handler leaves unread is drained after the response so the connection stays usable.

### `createAssetsLayer({ root })`

The disk layer over `dist/client`. `serve(req, res, next)` answers a held GET or HEAD before the handler runs; `fetch(request)` is the assets binding core reads for admin deep links, answering 404 for a path it does not hold. Paths that escape the root, name a directory without a trailing slash, or touch a dotfile other than `.well-known` are never held. Files under `/assets/` carry an immutable cache header, set only once the file has opened.

### `createImageLayer(imageDelivery, { fetch })`

The `/_plumix/image` route as Connect-style middleware, which the entry mounts between the assets layer and the bridge. Given the config's `imageDelivery`, it serves when that is `images()` and passes every request through otherwise, so a Cloudflare slot or none at all changes nothing. A same-origin source is read from `assets` first and then through `fetch`, which the entry points at the site's own handler with the visitor's address; `trustProxy` reads the host and address the way the bridge does.

### `diskStorage({ dir })`

The object-storage slot on the filesystem: each key is a file under `dir/objects/`, its content type and custom metadata a JSON file under `dir/meta/`. `url()` returns null, so the media plugin serves uploads through its own route, and there is no presigned upload; the browser sends the bytes to the site, which writes them. One directory, one process: for several processes sharing a bucket, `s3()` from `plumix/storage/s3` is the swap, one config line.

```ts
import { diskStorage } from "@plumix/runtime-node";

export default plumix({
  storage: diskStorage({ dir: "data/media" }),
  // …
});
```

## Commands

The `./commands` subpath registers the runtime's CLI commands with `plumix`:

- `plumix dev` — one Vite server: module serving, HMR and the staged admin shell answer first; everything else goes through the `node:http` bridge into the entry. An edit to the config, a theme or a plugin rebuilds the app on the next request, and a failing boot renders the dev error page. A `.env` in the project root is applied to the process environment (a variable the shell set wins) and re-applied when it changes; production loads no file. A change to `build.external` needs a restart. Accepts `--port` and `--host`; answers loopback hosts only unless `PLUMIX_DEV_ALLOW_REMOTE=1`, and a named remote host also needs Vite's `server.allowedHosts`.
- `plumix build` — the client and server bundles described above.
- `plumix migrate apply` — applies the migrations `plumix migrate generate` wrote to `drizzle/` to the file `nodeSqlite()` names. Drizzle records what it applied in `__drizzle_migrations`; a database is not portable between runtimes by copying the file.

## License

MIT
