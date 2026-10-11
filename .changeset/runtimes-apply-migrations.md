---
"@plumix/runtime-cloudflare": minor
"@plumix/runtime-node": minor
"@plumix/runtime-bun": minor
---

Applies migrations where the site runs. On Cloudflare, `plumix deploy` applies every pending migration to the remote D1 before it runs `wrangler deploy`, and a failed apply stops the deploy; on Workers Builds, set the deploy command to `npx plumix deploy`. Without `--binding`, migrations open the D1 binding the config's `d1()` slot names, so a wrangler config with several D1 databases needs no flag. The built Node and Bun servers apply the migrations their build shipped to their SQLite file before they listen, and exit 1 without listening when that fails. `serveWhenMain` on Node and `serveProcess` on Bun now return a promise, and `createBunSite` returns a `migrate` member. The Bun SQLite connection sets its busy timeout before switching to WAL, so a server starting while another migrates the same file waits instead of failing.
