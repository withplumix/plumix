# @plumix-apps/marketing

The Plumix **marketing site**, built on plumix (dogfood + proof).

**Status: scaffold.** Today it's the smallest buildable plumix app — no theme or
content plugins, so the public site serves plumix's built-in welcome screen. It
exists to reserve the workspace slot and prove `apps/` hosts a real plumix app.
The actual landing page — a theme, the `pages` plugin, real content, and the
Cloudflare dev-vs-deploy env split — lands with the **marketing-content
follow-up** to #1425. Deployment is not wired yet: the resource ids in
`wrangler.jsonc` are placeholders.

## Develop

```bash
pnpm dev
```

Runs `plumix dev` — a local Workers dev server on `http://localhost:8787`.

## Build

```bash
pnpm build
```
