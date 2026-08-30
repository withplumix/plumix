---
"@plumix/core": minor
"plumix": minor
---

Lets a plugin contribute raw SQL migrations that drizzle-kit cannot express.

`plumix migrate generate` shells out to drizzle-kit, which models tables, columns and indexes and
nothing else. A virtual table or a trigger had no route into the generated set: a hand-written file
dropped into `drizzle/` is invisible to drizzle's journal, so the next generate reuses the same
index and which of the two `wrangler d1 migrations apply` runs first becomes filename luck.

A plugin descriptor now takes `sqlMigrations` — a name and the statements to run. Generation emits
each one as its own file after the schema diff, so the DDL lands behind the tables it references,
and appends a journal entry so drizzle-kit numbers its next migration past it. That entry carries
no snapshot of its own, which drizzle-kit tolerates: it skips the index and diffs against the
previous snapshot, correct here because raw DDL touches only objects drizzle does not model. A name
is the migration's identity, so one already in the journal is never emitted twice — renaming it
emits it again rather than editing what has already reached a database.
