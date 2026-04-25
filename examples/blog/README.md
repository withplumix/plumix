# plumix-blog

Plumix app demoing the first-party content plugins:

- **`@plumix/plugin-blog`** — `post` entry type, `category` and `tag` taxonomies
- **`@plumix/plugin-pages`** — hierarchical `page` entry type

Targets Cloudflare Workers + D1. New plugins can be wired in `plumix.config.ts` as we add them.

## Develop

```bash
pnpm dev
```

Opens a local Workers dev server on `http://localhost:8787`.

## Build

```bash
pnpm build
```

Emits the worker bundle to `dist/plumix_blog/`. Equivalent to `pnpm exec plumix build`.

## Deploy

```bash
pnpm exec plumix migrate generate
pnpm exec wrangler d1 create plumix_blog
# paste the returned database_id into wrangler.jsonc
pnpm exec plumix migrate apply --remote
pnpm exec plumix deploy
```
