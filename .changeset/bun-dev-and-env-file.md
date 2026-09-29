---
"@plumix/runtime-bun": minor
---

Adds `bun --bun plumix dev`: the site, the admin and the RPC served by Vite with the site's code evaluated on Bun, and a config, theme or `.env` edit served on the next request without a restart. `.env` is the one env file in dev and in production: `bun dist/server/worker.js` loads it from the working directory before the site is built, a missing file is fine, and a variable the environment already set always wins. Set `env = false` in `bunfig.toml` so Bun's own loading does not also read `.env.local` or `.env.{NODE_ENV}`.
