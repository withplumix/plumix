---
"create-plumix-app": minor
---

Adds tests to a new site: Vitest, a `vitest.config.ts` calling `defineTestConfig()`, a `test` script, and `tests/feature/home.test.ts`, which visits `/` and asserts the page renders through the `fallback` template. `pnpm test` passes with no edits.
