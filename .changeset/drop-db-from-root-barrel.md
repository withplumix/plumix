---
"@plumix/core": minor
---

Remove the drizzle query operators and schema tables from the flat `@plumix/core`
/ `plumix` root barrel. They now live only on their dedicated seams:
`plumix/db` (`@plumix/core/db`) for the query operators, table-introspection
helpers, unique-constraint guards, and edge-cache purge vocabulary; and
`plumix/schema` (`@plumix/core/schema`) for the schema tables and their inferred
row types.

Direct DB writes are a specialized concern the `plumix/db` seam is designed to
own (its purge vocabulary exists precisely because direct writes bypass core's
auto-purge). Re-exporting the same operators and tables from the root barrel
widened the root interface with that concern and gave newcomers two ways to
import the same thing with no signal about which is canonical. `plumix/db` and
`plumix/schema` are now the single canonical seams.

The `traceDbQuery` / `traceDbBatch` span helpers stay on the root barrel — they
wrap `ctx.db` in runtime adapters and aren't part of the direct-write toolkit.

Migration: if you imported drizzle operators (`eq`, `and`, `sql`, `inArray`,
`getTableColumns`, the `SQL` type, …) from `plumix` / `@plumix/core`, import them
from `plumix/db` (`@plumix/core/db`) instead. If you imported schema tables
(`entries`, `terms`, `settings`, `users`, …) or their row types (`Entry`,
`User`, `UserRole`, `Term`, …) from the root, import them from `plumix/schema`
(`@plumix/core/schema`). The `plumix/plugin` bundle no longer re-exports these
either, so plugins that reached for db symbols through it move to the same two
seams.
