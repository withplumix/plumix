---
"@plumix/plugin-search": minor
---

Makes reindexing a resumable scheduled job, so a site can rebuild its search index without a request
that would never finish.

Projection runs at roughly 1 300 sources a second, so a large site is minutes of work — well past what
one invocation can do. A rebuild is now a run: a walk over every searchable entry and term, chunked
across scheduled invocations, with its position persisted rather than held in memory. An isolate that
dies mid-chunk loses the chunk, not the run.

`POST /_plumix/search/reindex` starts one and `GET` reports it, both behind a `search:reindex`
capability registered at `admin`. Starting is idempotent: a second request while a rebuild is under
way reports that one rather than beginning a rival walk over the same corpus. There is no cancel,
because there is nothing to undo — each source is re-projected in place and the index is never
emptied, so search keeps answering throughout. A run reports how much it has processed, how much it
could not, and a final status; `succeeded` and `completed_with_errors` are separate answers, since one
means the rebuild worked and the other means it finished but left something behind.

The same schedule repairs extractor drift. The extractor version is a hash of every block's text
declaration, so changing one makes every existing document stale — but the work is now proportional to
what actually changed. A document whose extracted text is identical is stamped with the new version
and never reaches FTS5, because the index's update trigger is scoped to the two columns it shadows.
Only the entries a declaration really moved are re-tokenized. That scoping ships as a second raw
migration, since one the journal already carries is never emitted again — so run
`plumix migrate generate` and apply it after upgrading. The runtime repair path recognises the older
trigger and replaces it as well, so a site that never generates migrations converges anyway.

A rebuild steps over any entry the change feed still owes: those have been written since the walk
started, the drain holds the fresher text, and projecting them from the walk's older read could put
the previous version back. A run that throws is marked `failed` rather than left running, because
starting is idempotent and a run stuck at `running` would refuse every replacement an operator asked
for. A batch that fails is retried one source at a time, so a single bad row cannot take two hundred
healthy ones with it.
