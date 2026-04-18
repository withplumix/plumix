# plumix-minimal

Smallest buildable Plumix app. Targets Cloudflare Workers + D1.

## Develop

```bash
pnpm dev
```

Opens a local Workers dev server (via `@cloudflare/vite-plugin`) on `http://localhost:8787`.

## Build

```bash
pnpm exec plumix build
```

Emits the worker bundle to `dist/plumix_minimal/`.

## Deploy

```bash
pnpm exec plumix migrate generate
pnpm exec drizzle-kit generate --schema .plumix/schema.ts --dialect sqlite --out drizzle
pnpm exec wrangler d1 create plumix_minimal
# paste the returned database_id into wrangler.jsonc
pnpm exec wrangler d1 migrations apply plumix_minimal --remote
pnpm exec plumix deploy
```

Every `plumix` subcommand (`doctor`, `types`, `migrate generate`, `deploy`, …) is reachable via `pnpm exec plumix <cmd>` — only the conventional `dev`/`build` are wrapped as scripts.
