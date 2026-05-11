# plumix-starter

Plumix app with the blog and pages plugins on Cloudflare Workers + D1.

## Develop

```bash
pnpm install
pnpm dev
```

Opens a local Workers dev server (via `@cloudflare/vite-plugin`) on
`http://localhost:8787`. The admin signs in via passkey — register
the first admin from `/admin/login` on first boot.

## Build

```bash
pnpm build
```

Emits the worker bundle to `dist/plumix_starter/`. Equivalent to
`pnpm exec plumix build`.

## Deploy

Edit `wrangler.jsonc` and `plumix.config.ts` for your account first:

- `wrangler.jsonc` → `name` and `d1_databases[0].database_name` /
  `database_id` (run `wrangler d1 create plumix_starter` and paste the id).
- `plumix.config.ts` → `cloudflareDeployOrigin({ workerName, accountSubdomain })`
  with your worker name + Cloudflare account subdomain.

Then:

```bash
pnpm exec plumix migrate generate
pnpm exec plumix migrate apply --remote
pnpm exec plumix deploy
```

`plumix migrate generate` wraps `drizzle-kit generate` and walks the
schema contributed by every installed plugin. `plumix migrate apply`
auto-discovers the D1 database name from `wrangler.jsonc`.

## What's included

- **`@plumix/plugin-blog`** — posts, archives, single views, draft
  workflow.
- **`@plumix/plugin-pages`** — hierarchical pages with permalink
  routing.
- **`consoleMailer()`** — outgoing mail (email-change confirmation,
  plus magic-link if you wire it up later) logs to the worker output.
  Swap in any `Mailer` (one method) for production — Postmark, SES,
  Resend, etc.

## What's not included

- Media uploads (`@plumix/plugin-media`) — add an R2 binding to
  `wrangler.jsonc`, install the plugin, and pass `storage: r2(...)`
  to `plumix({...})`. See `examples/blog` in the plumix repo.
- Navigation menus (`@plumix/plugin-menu`) — install the plugin and
  call `registerMenuLocation(...)` from your theme to surface slots.
- Activity-feed audit log (`@plumix/plugin-audit-log`) — install and
  pass to `plugins: [auditLog()]` to capture admin actions.

## Customising further

Every `plumix` subcommand (`doctor`, `types`, `migrate generate`,
`deploy`, …) is reachable via `pnpm exec plumix <cmd>` — only the
conventional `dev` / `build` are wrapped as scripts. Run `pnpm exec
plumix --help` to see the full list.
