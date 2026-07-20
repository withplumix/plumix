# @plumix-apps/marketing

The Plumix **marketing site**, built on plumix (dogfood + proof).

**Status: scaffold, filling in.** It wires the `pages` and `media` plugins over a
real D1 database and an R2 `MEDIA` bucket, so content can be authored now. It has
no theme yet, so the public site still serves plumix's built-in welcome screen —
the landing-page theme (and the Cloudflare dev-vs-deploy env split) lands with
the **marketing-content follow-up** to #1425.

## Develop

```bash
pnpm dev
```

Runs `plumix migrate generate && plumix dev` — a local Workers dev server on
`http://localhost:8787`.

## Build

```bash
pnpm build
```
