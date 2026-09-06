---
"plumix": minor
---

`plumix/test` exports `applyCoreTestSchema(db)`, which lays core's tables and the change-feed triggers onto a database a runtime or plugin suite opened itself. `createTestDb` goes through the same function, so a test database built by hand cannot drift from the one core hands out and an entry save fires the triggers production has.
