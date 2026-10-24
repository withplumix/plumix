---
"plumix": minor
---

Adds `fakeCdn()` to `plumix/test`: an in-memory cdn to hand `createDispatcherHarness` as `cdn`, so a test renders a page, makes a write and checks the page is gone with `assertNotStored(path)`, or still there with `assertStored(path)`.
