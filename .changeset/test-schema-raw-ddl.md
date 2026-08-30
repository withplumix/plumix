---
"@plumix/core": minor
"plumix": minor
---

Adds a third argument to `applyTestSchema` from `plumix/test` for raw SQL statements that run after the compiled drizzle schema, so a suite can set up the triggers and virtual tables drizzle cannot express and test against the schema production actually has. Pass one statement per array entry.
