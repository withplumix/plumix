---
"create-plumix-app": patch
---

Fixes `pnpm create`, `yarn create` and `bun create` scaffolding with npm: the CLI now reads `npm_config_user_agent`, so dependencies install, local migrations run and next steps print with the package manager that invoked it. An explicit `--pm` still wins.
