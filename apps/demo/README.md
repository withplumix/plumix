# @plumix-apps/demo

The Plumix **demo sandbox** — the anonymous "try the editor" app (#1338) and the
primary workspace-linked **dev harness** for hacking on core.

It wires the first-party content plugins (`@plumix/plugin-blog`,
`@plumix/plugin-pages`, plus comments, media, and menu) and spreads
`demoPreset` from `@plumix/runtime-cloudflare/demo`: every visitor gets an
isolated per-session Durable Object database, a synthetic auto-logged-in admin,
and the demo runtime wrapper. Real auth flows are intentionally blocked in demo
mode. Targets Cloudflare Workers + D1.

## Develop

```bash
pnpm dev
```

Runs `plumix migrate generate && plumix dev` — a local Workers dev server on
`http://localhost:8787`. Synthetic-admin auto-login means there's no login step;
enter the editor straight from the public showcase's "Try the editor" CTA.

## Build

```bash
pnpm build
```

Emits the worker bundle to `dist/`. Runs `plumix migrate generate` first — the
schema (`drizzle/`) is generated from the current core + plugin schema rather
than committed, so it can't drift — then `plumix build`.

## Test

```bash
pnpm test:e2e
```

Playwright drives the full anonymous-visitor funnel (public showcase → CTA →
session provision → admin → create → persist) against this app.

## Deploy

```bash
pnpm exec plumix migrate generate
pnpm exec wrangler d1 create plumix_demo
# paste the returned database_id into wrangler.jsonc
pnpm exec plumix migrate apply --remote
pnpm exec plumix deploy
```
