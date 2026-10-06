---
"plumix": patch
---

Fixes `plumix.config.ts` failing to load when it, the theme, a plugin or anything they import uses the `~/` or `@/` project-root alias. Those modules can now import through `~/` and `@/` under `plumix dev`, `plumix build` and every other CLI command.
