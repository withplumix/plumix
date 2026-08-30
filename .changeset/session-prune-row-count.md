---
"@plumix/core": patch
---

Counts the sessions the nightly cleanup reaped off the driver instead of reading every deleted row back.

`pruneExpiredSessions` asked SQLite for the id of each row it deleted purely to take `.length` of the result. On a site whose sessions have been accumulating — the cleanup only runs where the deploy declares the matching `triggers.crons` entry, so a deploy that adds one later reaps the whole backlog on its first night — that is a row of heap per expired session to measure a number the driver was already holding. It now reads the count off `rowsAffected`.

That trades portability for the heap: `returning()` answered on every driver, and `rowsAffected` throws on one that reports no count. The demo runtime's `sqlite-proxy` adapter is the only such driver in the box, and it registers no scheduled tasks, so nothing in a Plumix deploy reaches the throw. A third-party runtime on an exotic driver would, and should read the rows back itself.
