# __PROJECT_NAME__

A [Plumix](https://github.com/withplumix/plumix) site.

## Develop

```sh
pnpm dev
```

Then open the admin at `/_plumix/admin`.

## Build

```sh
pnpm build
```

## Deploy

This project targets Cloudflare Workers + D1. Before your first deploy, create
the database and paste its id into `wrangler.jsonc`:

```sh
wrangler d1 create __PROJECT_NAME__
plumix migrate generate
plumix migrate apply --remote
plumix deploy
```
