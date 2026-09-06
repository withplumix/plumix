---
"@plumix/runtime-node": patch
---

Declares the `plumix.e2e` block (`data/` wiped before a run, the database at `data/*.sqlite`) and ships a playground that runs the shared runtime spec through `plumix dev` — bootstrap, publish, public read, media upload, sign out — so Node and Cloudflare are proven by the same assertions. Adds the one case only Node has: an edit to the playground config while the server runs is served on the next request.
