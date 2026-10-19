---
"@plumix/runtime-bun": minor
---

Adds `plumix sync` and `plumix import` on Bun: the local end reads and writes the `bunSqlite()` file and the storage slot, and the remote end reaches the deployed site's sync routes with an API token. A push snapshots the deployed database file with `VACUUM INTO` and prints the copy's path and the command that restores it.
