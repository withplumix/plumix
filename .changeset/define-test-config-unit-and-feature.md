---
"plumix": minor
---

Splits `defineTestConfig()` into two Vitest projects: `unit` runs `*.test.ts(x)` under `src/`, and `feature` runs those under `tests/feature/`, so `vitest --project feature` works with no setup. Breaking: a test outside `src/` and `tests/feature/` no longer runs; move it into one of them. Also fixes `testSite()` with no arguments failing to load the project's `plumix.config.ts` from an installed `plumix`, such as a config that imports a TSX theme from a folder.
