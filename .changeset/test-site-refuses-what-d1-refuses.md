---
"plumix": minor
---

Adds D1's limits to the test site: when the config's database is `d1()`, a statement binding more than 100 parameters and an interactive `db.transaction` fail in the test as they would in production, with an error naming the cap and the fix (`chunkForD1`, or `db.batch`). `describeDatabaseContract` takes `d1Limits: true` to hold an adapter to both.
