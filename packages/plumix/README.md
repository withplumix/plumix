```
        _                 _
  _ __ | |_   _ _ __ ___ (_)_  __
 | '_ \| | | | | '_ ` _ \| \ \/ /
 | |_) | | |_| | | | | | | |>  <
 | .__/|_|\__,_|_| |_| |_|_/_/\_\
 |_|
```

**A modern headless CMS, built for the edge.** Content modeling, a block editor, auth, and a full admin UI — with a pluggable runtime, so your CMS isn't welded to a single platform.

> [!WARNING]
> **Pre-1.0 software.** Minor versions can contain breaking changes — pin your versions.

## Quick start

The fastest way in is the scaffolder — it wires up a working app, runtime, and admin for you:

```bash
pnpm create plumix-app my-site
cd my-site
pnpm install
pnpm dev
```

Then open `http://localhost:5173/_plumix/admin`, create your first passkey, and you're in.

## What's in the box

- **Content modeling** — entry types, taxonomies, and meta fields, contributed by plugins.
- **Block editor** — a bespoke visual editor backed by a React block system.
- **Auth** — passkeys (WebAuthn) first, with optional OAuth and magic-link sign-in.
- **Admin UI** — a precompiled SPA your worker serves at `/_plumix/admin`.
- **Pluggable runtime** — an adapter seam, not a lock-in. Cloudflare Workers is the first (D1, R2, KV, Images, edge cache); more runtimes are on the way.
- **Extensible** — plugins add entry types, blocks, admin pages, RPC, routes, and cron.

## Configure

`plumix.config.ts` is where it all comes together — pick a runtime, a database, and an auth method:

```ts
import { auth, plumix } from "plumix";

import {
  cloudflare,
  cloudflareDeployOrigin,
  d1,
} from "@plumix/runtime-cloudflare";

const { rpId, origin } = cloudflareDeployOrigin({
  workerName: "my-site",
  accountSubdomain: "my-account",
  localOrigin: "http://localhost:5173",
});

export default plumix({
  runtime: cloudflare(),
  database: d1({ binding: "DB", session: "auto" }),
  auth: auth({
    passkey: { rpName: "My Site", rpId, origin },
  }),
});
```

Add capabilities by dropping plugins into `plugins`:

```ts
import { blog } from "@plumix/plugin-blog";
import { pages } from "@plumix/plugin-pages";

// inside plumix({ ... })
plugins: [blog, pages],
```

## Runtimes

The runtime is pluggable — you choose where Plumix runs. Available now:

- **[Cloudflare Workers](../runtimes/cloudflare)** — D1, R2, KV, Images, and edge cache.

More runtimes are on the way.

## Plugins

Add features by dropping official plugins into your config:

- **[Blog](../plugins/blog)** — posts, categories, and tags.
- **[Pages](../plugins/pages)** — hierarchical static pages.
- **[Menu](../plugins/menu)** — navigation menus from entries, terms, and custom URLs.
- **[Comments](../plugins/comments)** — threaded, moderated discussion.
- **[Media](../plugins/media)** — media library and uploads.
- **[Audit log](../plugins/audit-log)** — an activity feed of who did what.

## Support

Have a question? Start a [discussion](https://github.com/withplumix/plumix/discussions). Found a bug? [Open an issue](https://github.com/withplumix/plumix/issues).

## Contributing

PRs and ideas welcome. The [Contributing guide](https://github.com/withplumix/plumix/blob/main/CONTRIBUTING.md) gets you set up — new contributors especially welcome.

## License

[MIT](https://github.com/withplumix/plumix/blob/main/LICENSE) © Plumix Contributors
