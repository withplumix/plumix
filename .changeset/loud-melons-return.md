---
"@plumix/runtime-cloudflare": patch
---

`cloudflareDeployOrigin` now resolves the deployed origin on a Cloudflare
Workers Builds deploy instead of falling back to localhost on every one of
them. It read `WORKERS_CI` and `WORKERS_CI_BRANCH` through a local view of
`process.env`, which the Plumix Vite plugin's `define` — a literal
member-expression substitution — passed by, so the read survived into the
bundle and ran inside the Worker isolate, whose `process.env` carries
bindings and never those names. Every deploy returned `rpId: "localhost"`
before `productionOrigin` or `accountSubdomain` was read, and the browser
refused every passkey ceremony on the deployed host. Both names are now read
as the literal member expressions the substitution rewrites.
