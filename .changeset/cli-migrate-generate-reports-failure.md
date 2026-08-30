---
"@plumix/core": minor
"plumix": minor
---

Stops `plumix migrate generate` reporting success over migrations it never wrote, and wipes the
generated `drizzle/` before an e2e run regenerates it.

drizzle-kit catches its own generate errors, prints them, and exits 0. The CLI already refused a
non-zero exit, but that code never came, so a failed generate still printed `✓ Migrations emitted`
and left the previous run's SQL in place. The command now reads what drizzle-kit put on stderr —
empty on success, including a generate that finds nothing to do — and fails with
`migrate_generate_failed` when there is any. Because stderr is now the signal, drizzle-kit runs
under `--no-warnings`, so Node's own deprecation notices cannot be mistaken for one.
`spawnCapturingStderr` is the new `@plumix/core` seam behind it: `spawnInherit` with stderr teed
rather than inherited, so the child's output still reaches the terminal as it arrives.

The failure it was hiding: the worker-driven e2e command baked by `definePlumixE2EConfig` wiped
`.wrangler/state` but not `drizzle/`. That directory is gitignored and regenerated from the current
schema every run, so one left over from an earlier run is output from an older schema — which
drizzle-kit will not replace without being told how to resolve the rename. `wrangler d1 migrations
apply` then builds a database missing whatever the schema added since, and the suite fails much
later on the missing table. CI never saw it: a fresh checkout has no `drizzle/`, so there is nothing
to diff against. The baked command now wipes it alongside the state it belongs to, which is what
makes a repeat local run match the fresh checkout CI always gets.
