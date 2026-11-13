---
"plumix": patch
"@plumix/runtime-cloudflare": patch
---

Fixes `plumix sync` and `plumix import` against a remote Cloudflare site ignoring `--token` for the settle after the import: the settle now uses the same token as the rest of the command. `settleDeployedSite` from `plumix/cli` takes that token's resolver as a third argument, `settleDeployedSite(url, event, apiToken)`, and no longer reads `PLUMIX_API_TOKEN` or starts the device flow itself.
