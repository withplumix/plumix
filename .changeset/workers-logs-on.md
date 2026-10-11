---
"@plumix/runtime-cloudflare": minor
---

Turns on Workers Logs in the scaffolded `wrangler.jsonc`, so a deployed site keeps its request errors, exceptions and Plumix's console output. `plumix doctor` now warns when a project's wrangler config leaves Workers Logs off and prints the block to add.
