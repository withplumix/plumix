# @plumix-apps/marketing

The Plumix **marketing site**, built on plumix (dogfood + proof).

**Status: filling in.** It wires the `pages` and `media` plugins over a real D1
database and an R2 `MEDIA` bucket. The theme in `theme/` renders the landing
page from code; pages authored in the admin render through its `entry` template.
The code on the page is imported as text from `snippets/`, which `typecheck`
compiles on its own, so a snippet that drifts from the API fails CI. In
`public/screenshots/`, the admin dashboard is copied from the docs app; the dev
error page and debug bar were captured from this app's `plumix dev`.

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
