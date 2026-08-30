---
"@plumix/plugin-forms": minor
"@plumix/core": minor
---

Sets a retention period once for the whole site, and stops the nightly purge reading the whole table to find the tail it deletes.

`forms({ retentionDays: 90 })` is now the period every form keeps its submissions for, so a site says once how long it is entitled to what its forms collect instead of repeating the number on each of them. A form declaring its own period still keeps that one, `0` included — on a form that is a declaration rather than an absence, and so the way one form opts out of a period the site set for the rest. Both default to keeping submissions indefinitely, which is the only default that cannot lose an enquiry nobody asked to lose.

The nightly sweep now bounds each form by `id` as well as by date. `created_at` is in no index, so the old condition read the whole table — one form's arm walking that form's entire backlog, and several arms OR'd together dropping to a plain scan. Measured on 200,000 rows across three forms, it read all 200,000 to delete 703, and read all 200,000 again on a night with nothing to purge at all. It now reads 1,409 and 3. No index was added — a `(form, created_at)` one would have cost a b-tree insert on every submission and made the inbox's date-range filter 65× to 2,633× more expensive, for a further 2×.

Ids are arrival order for every row the plugin writes, since a submission takes the column's `unixepoch()` default. A row backdated by a direct write to `form_submissions` or by an import sits outside that order: it is kept rather than deleted, and goes once the rows stored before it have expired too.

The sweep also counts what it deleted off the driver rather than asking for every deleted id back. The first sweep after a site sets a period is unbounded, and 200,000 ids cost around 106 MB of heap to measure a number the driver was already holding — against a Worker's 128 MB limit. `plumix/db` exports the `rowsAffected` helper this needs, which reads the count off libsql's `rowsAffected`, D1's `meta.changes`, or a top-level `changes` for better-sqlite3, node:sqlite and bun:sqlite. It throws for a driver that reports no count at all rather than logging a zero it cannot stand behind — the demo runtime's `sqlite-proxy` adapter is one, though it registers no scheduled tasks for the purge to run under.

`FormDefinition.retentionDays` is now `number | undefined` rather than `number`, since a form that declares no period is no longer the same thing as one that declared zero. Code reading the period off a definition should read it off the registry's `retentionDaysFor` instead, which folds in the site's own.
