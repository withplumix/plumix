This project targets Cloudflare Workers + D1. Before your first deploy, create
the database and paste its id into `wrangler.jsonc`:

```sh
wrangler d1 create __PROJECT_NAME__
plumix deploy
```

`plumix deploy` applies pending migrations to that database before it runs
`wrangler deploy`. On Workers Builds, set the deploy command to
`npx plumix deploy`.
