---
"@plumix/plugin-search": minor
"@plumix/core": minor
---

A search whose index is missing now degrades instead of failing.

The FTS5 index is the half of the plugin's schema no drizzle migration can describe, so it is the half
that can genuinely be absent: a raw SQL migration that was never applied, a restored dump, an install
before its first scheduled run. Until now a visitor met that as an error page.

A search that finds no index answers from core's own vocabulary instead — each word of the query matched
as a substring of the entry's title or excerpt — and creates the index behind the response, so the next
search is a real one again. The repair is deferred rather than awaited: it ends in a rebuild, which is
proportional to the corpus, and the visitor holding the degraded page already has their answer. It is
also idempotent without a lock, because D1 has none and two requests can arrive on the same missing
index.

What is worse in the meantime is worth knowing: a word only an article's body holds is not found, no
snippet is highlighted, results carry no score, and topics are missing entirely, since core's page has
never returned them. A missing table that is not the index is still an error, so a schema broken some
other way is reported rather than quietly answered from half a query.

Core exposes `tokenizeSearchQuery` and `entrySearchCondition` from `plumix/db` for this — how a query
parses, and what matching a term against title and excerpt means — so a plugin replacing the search page
can degrade to core's own query rather than restate it and drift.

The repair also covers an index whose objects exist but hold nothing, which is what an interrupted repair
leaves behind: creating the virtual table and filling it are two statements, and a check on
`sqlite_master` alone would call that healthy for good. Left alone it is not a quieter search but a
corrupting one — the next update to a row the index never held tells FTS5 to unindex terms that are not
there.
