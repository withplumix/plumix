---
"@plumix/core": minor
---

Adds `createTestContext` and `applyTestSchema` to `plumix/test`. `createTestContext({ db })` hands a test a real `AppContext` for exercising a service function directly, replacing the `{ db }` stand-ins that omitted everything a handler reads through. `applyTestSchema(db, schema)` creates a drizzle schema module's tables on an existing test db, so a plugin suite can layer its own tables onto a core test db without repeating the drizzle-kit snapshot dance.
