---
"plumix": minor
---

Makes `plumix sync pull` go on from the dump a failed pull left under `.plumix/sync/`, exporting only the tables it had not finished. Adds `settleDeployedSite` to `plumix/cli`, which a runtime's sync transport calls to settle the deployed site with the operator's API token, failing with `sync_remote_token_missing` or `sync_settle_refused`.
