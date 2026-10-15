This project targets Cloudflare Workers + D1. Before your first deploy, create
the database and paste its id into `wrangler.jsonc`:

```sh
wrangler d1 create __PROJECT_NAME__
plumix deploy
```

`plumix deploy` applies pending migrations to that database before it runs
`wrangler deploy`. On Workers Builds, set the deploy command to
`npx plumix deploy`.

Pages are cached at the edge only once the Worker can purge them. Set
`CF_ZONE_ID` and `CF_CACHE_PURGE_TOKEN` (a token with the zone's `Cache Purge`
permission) with `wrangler secret put`; until then every page renders live.
See [CDN Caching](https://docs.plumix.dev/deployment/cdn/).
