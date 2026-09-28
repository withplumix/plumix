---
"@plumix/runtime-cloudflare": minor
---

Makes `.env` the local secrets file for `plumix dev`, in place of `.dev.vars`: wrangler reads `.env` when no `.dev.vars` exists, and the scaffold now ships a `.env.example`. Rename `.dev.vars` to `.env` in an existing project. Production is unchanged: a deployed Worker still takes its secrets from `wrangler secret` or the dashboard.
