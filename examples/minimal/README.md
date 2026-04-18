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
pnpm exec wrangler d1 create plumix_minimal
# paste the returned database_id into wrangler.jsonc
pnpm exec plumix migrate apply --remote
pnpm exec plumix deploy
```

`plumix migrate generate` chains `drizzle-kit generate` for you (requires `drizzle-kit` as a devDependency). `plumix migrate apply` auto-discovers the D1 database name from `wrangler.jsonc` / `wrangler.toml` — pass it explicitly (`plumix migrate apply <db-name>`) if you have more than one.

Every `plumix` subcommand (`doctor`, `types`, `migrate generate`, `deploy`, …) is reachable via `pnpm exec plumix <cmd>` — only the conventional `dev`/`build` are wrapped as scripts.
