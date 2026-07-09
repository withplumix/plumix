```
        _                 _
  _ __ | |_   _ _ __ ___ (_)_  __
 | '_ \| | | | | '_ ` _ \| \ \/ /
 | |_) | | |_| | | | | | | |>  <
 | .__/|_|\__,_|_| |_| |_|_/_/\_\
 |_|
```

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

**A modern headless CMS, built for the edge** — content modeling, a block editor, passkey auth, and a full admin UI, with a pluggable runtime so you're never locked to one platform.

> [!WARNING]
> **Pre-1.0 software.** Minor versions can contain breaking changes — pin your versions.

## Why Plumix

- **Edge-native** — deploys as a single unit and runs close to your users, with no origin server to babysit.
- **Runtime-agnostic** — the runtime is a pluggable adapter, not a lock-in. Run it where it makes sense for you.
- **Headless, your way** — a typed content API with a block editor, and themes that render however you like.
- **Passwordless auth** — passkeys (WebAuthn) first, with optional OAuth and magic-link sign-in.
- **Extensible** — plugins add entry types, blocks, admin pages, RPC, routes, and cron.
- **Type-safe end to end** — TypeScript throughout, with typed RPC between the admin and your worker.

## Quick start

```bash
pnpm create plumix-app my-site
cd my-site
pnpm install
pnpm dev
```

Then open `http://localhost:5173/_plumix/admin` and create your first passkey.

## Runtimes

The runtime is pluggable — you choose where Plumix runs. Available now:

- **[Cloudflare Workers](./packages/runtimes/cloudflare)** — D1, R2, KV, Images, and edge cache.

More runtimes are on the way.

## Plugins

Add features by dropping official plugins into your config:

- **[Blog](./packages/plugins/blog)** — posts, categories, and tags.
- **[Pages](./packages/plugins/pages)** — hierarchical static pages.
- **[Menu](./packages/plugins/menu)** — navigation menus from entries, terms, and custom URLs.
- **[Comments](./packages/plugins/comments)** — threaded, moderated discussion.
- **[Media](./packages/plugins/media)** — media library and uploads.
- **[Audit log](./packages/plugins/audit-log)** — an activity feed of who did what.

## Documentation

Agent-facing conventions live in [`AGENTS.md`](./AGENTS.md) and
[`docs/agents/`](./docs/agents). Authoring guides ship with 1.0.

## Contributing

PRs and ideas welcome. The [Contributing guide](./CONTRIBUTING.md) walks you
through setup — new contributors especially welcome.

## Security

Found a vulnerability? Please follow our [security policy](./SECURITY.md) rather
than opening a public issue.

## License

[MIT](LICENSE)
