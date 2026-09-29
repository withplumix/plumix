---
"create-plumix-app": minor
"@plumix/runtime-bun": minor
---

Adds `create-plumix-app --runtime bun`: a project on `bun()` with `bunSqlite` under `data/`, uploads through `diskStorage`, `@types/bun`, a `bunfig.toml` that leaves `.env` to the runtime, and `bun --bun plumix` scripts for `dev`, `build` and `migrate:apply`. It installs with Bun whichever package manager invoked the scaffolder, pins `packageManager` to the Bun the runtime is tested on, and exits with an error when `--pm` names another manager.
