# Each table owner ships its own migration history

Core and every plugin declare tables, and today every site diffs all of them
into one history of its own with drizzle-kit. `create-plumix-app` commits that
history (`drizzle/`) in the site's first commit, and production replays it. So
each site re-derives migrations for tables it does not own:

- An upgrade that renames a core column asks every site's developer whether
  `summary` was renamed from `excerpt`, about a table they never wrote. Without
  a terminal, generate fails, and the CLI's advice is to delete `drizzle/` and
  regenerate, which forks the history the site's D1 has already replayed.
- The e2e helper "fixes" drift by deleting `drizzle/` before every run, which
  deletes a site's committed history (#2819).
- Adding a plugin that owns a table takes two commands nobody prompts for, and
  `plumix dev` starts without a word while the plugin's table is missing.

Laravel does not have this problem because each package ships the migrations
for its own tables and the application only runs them; `RefreshDatabase`
replays the committed migrations once per process and never writes one.
drizzle's own migrator applies a folder of migrations and records them in a
table whose name the caller chooses. A spike (#2819) applied one history per
owner through drizzle's D1 migrator to a fresh local D1, booted `plumix dev`
on it, and adopted a database built from a legacy single history, whose schema
matched the owner histories object for object.

> **Each table owner — core, a plugin, a site's own tables — ships its own
> drizzle-native migration history, generated and committed by that owner.
> Plumix applies them with drizzle's own migrator, one tracking table per
> owner, in config order, wherever a database is used: `plumix dev`, e2e,
> `plumix deploy` and `plumix migrate`. Plumix never deletes or rewrites a
> history, and never reads or writes drizzle's migration files itself; it
> decides only which folders apply, under which tracking table, in what
> order.**

## What this means

- **A site's history holds only the site's own tables.** Most sites own none
  and keep no history. A package from npm is never diffed into it.
- **One tracking table per owner** (`__drizzle_migrations_<owner>`). drizzle
  0.x applies only migrations newer than the newest one it has recorded, so a
  shared table skips a plugin's older migrations once another owner's newer
  one has run; the spike reproduced it on an ordinary upgrade. Per-owner tables
  make each owner's history independent, and keep working once drizzle v1
  tracks by name.
- **Order is core, then plugins in config order, then the site.** Core never
  references a plugin, so core's pending migrations always run first and a
  plugin migration may rely on any core table its `plumix` peer floor
  guarantees.
- **Hand-written DDL is an ordinary migration** in its owner's history
  (`drizzle-kit generate --custom`). The separate raw-SQL declaration and the
  planner that wrote drizzle's journal go away.
- **Generating stays the owner's act.** Package maintainers generate when a
  package's tables change, and CI fails when a package's declared tables are
  ahead of its history, so a rename is decided once, by the people who own the
  table. `plumix dev` generates the next migration of a site's own tables and
  says to commit it; e2e, CI and deploy only check and fail.
- **Adoption is automatic when it is provably safe.** A database built from a
  legacy site history is adopted on the first apply when its schema matches the
  owner histories exactly, by recording their migrations as applied. This is
  the one place Plumix writes drizzle's tracking table, and only until drizzle
  v1's own `init` can do it. A mismatch refuses with the difference.
- **Cloudflare applies through drizzle, not `wrangler d1 migrations apply`.**
  Wrangler tracks one flat directory by filename and cannot read drizzle v1's
  folders. `migrations_dir` leaves the scaffold.
- **Upgrading drizzle touches only what drizzle changed.** A v1 upgrade runs
  `drizzle-kit up` on each history and changes the migrator import, because
  Plumix holds no knowledge of the file format.

## Considered options

- **Keep one site history, but stop the e2e helper deleting it**, wiping only
  when `drizzle/` is gitignored or behind an option. It fixes #2819 and leaves
  every site answering rename prompts about core's tables on every upgrade.
- **Keep one site history and check it for drift** (`migrate check`), appending
  locally and failing in CI. Each site still re-derives every package's
  migrations; the check only reports the problem sooner.
- **Packages ship migrations into one global, timestamp-ordered stream**, as
  Laravel does. drizzle 0.x tracks a high-water mark rather than names, so a
  late-installed plugin's older migrations would be skipped silently.
- **Plumix runs its own migrator** with its own tracking. It works today and
  makes every drizzle upgrade our problem, which is what this decision exists
  to avoid.
