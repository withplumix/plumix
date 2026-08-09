---
"@plumix/core": minor
"plumix": minor
---

Add a `plumix/db` (`@plumix/core/db`) subpath and complete the direct-write toolkit.

A plugin running a bulk-ingest pipeline writes directly to `ctx.db`, which
bypasses core's entry-mutation service — so no `entry:*`/`term:*` action fires
and core's edge-cache purge invalidator never runs, leaving the public archive
and permalinks stale until TTL. Making that path first-class needed two things
the public API didn't expose:

- **The edge-cache tag vocabulary.** `typeTag`, `entryTag`, `entryPurgeTags`,
  `termPurgeTags`, and `enqueuePurgeTags` are now exported, so a direct-write
  plugin can enqueue the same coarse `t:<type>`/`e:<id>` tags core would —
  `enqueuePurgeTags(ctx, entryPurgeTags(type, id))` — for the post-request /
  scheduled flush, instead of hand-restating the scheme (PRD #1080) and drifting
  when it changes.
- **The Drizzle table-introspection helpers.** `getTableColumns`, `getTableName`,
  and `is` live on the `drizzle-orm` root rather than its `/sql` subpath, so they
  weren't reachable through core. `getTableColumns` in particular is how a bulk
  `onConflictDoUpdate` derives its set clause — without it a plugin had to add
  its own `drizzle-orm` dependency (which can drift from core's pinned version).

The new `plumix/db` / `@plumix/core/db` subpath groups the whole toolkit — query
operators, schema tables, introspection helpers, and the purge vocabulary — in
one import so a direct-write plugin never needs its own `drizzle-orm`
dependency. Everything is also reachable from the flat package root.
