---
"plumix": minor
---

Removes the browser test project from `defineTestConfig` and the browser build of `plumix/test`. Plugin tests run in Node, and browser behaviour belongs in Playwright e2e. Drop `@vitest/browser-playwright` from your dev dependencies.
