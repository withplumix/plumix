# A runtime names its remote databases from its platform config

On Cloudflare, `plumix migrate --remote` could reach one database: the top-level
`d1_databases` of the wrangler config (#3154). A site with a wrangler
environment (`env.<name>`) or a Worker Previews database (`previews`) could not
migrate it, so a Workers Builds preview build migrated production. The remote
connection also went through `getPlatformProxy`, wrangler's dev-time API, which
opens `preview_database_id ?? database_id`, so a binding with a
`preview_database_id` redirected a production migration to the dev database.
And `--remote` wrote without showing what it would do, though `sync push` and
`import` already printed a plan and asked first.

> **A runtime names its remote databases in its platform's terms, resolved
> from the platform's own config, which is the source of truth for that site.
> A runtime declares the target options it accepts, and the CLI parses them
> with its own. Every write to a remote database prints a plan and is
> confirmed first.**

## What this means

- **Targets are the platform's words.** Cloudflare declares `--production`,
  `--preview` and `--env <name>`, and resolves them through wrangler's own
  config reader, so `env` and the inheritance of `previews` resolve as
  `wrangler deploy` and `wrangler preview` resolve them. A target is an
  environment plus a preview flag, the shape of `cf`'s `ctx.mode` and
  `ctx.isPreview`, so a later `cloudflare.config.ts` reader fits the same
  model. Plumix chooses only the block and the binding.
- **A target reaches exactly its block's `database_id`.** No fallback to
  another block, and never `preview_database_id`, which belongs to
  `wrangler dev`. A block with no D1 fails before connecting, naming the block
  and the binding and giving what to add.
- **The CLI owns the parser; the runtime owns the words.** `RuntimeMigrations`
  and `RuntimeSync` may declare `targetOptions`. Core merges them into its
  strict parser and `plumix --help`, rejects any other flag naming the runtime,
  and hands the parsed values to `open`. Core no longer has a `--remote` flag
  of its own. A runtime that declares no options, as Node and Bun do, has only
  its local database. A command a runtime adds whole, such as `deploy` or
  `preview`, stays in its `commands` registry and parses its own arguments.
- **The opened database says what it is.** `MigrationDatabase.target` carries
  whether it is remote, the line the CLI prints before anything runs, and the
  notes a plan adds (on Cloudflare, that a top-level `previews` database is
  shared by every branch).
- **One plan-and-confirm rule for remote writes.** Print the plan, ask
  `[y/N]`, skip the question with `--yes`, stop after the plan with
  `--dry-run`, and refuse without a terminal and no `--yes`. `sync push` and
  `import` already followed it; `migrate` now does. A local write never asks.
  A runtime's `deploy` prints the plan and migrates without asking: running
  `deploy` is the confirmation.

## Considered options

- **Keep `--remote` and add `--preview` beside it.** Leaves `--remote`
  meaning "the top level", which is wrong for a site whose production is
  `env.production`, and keeps a word no platform uses.
- **A `--config <path>` flag passed to the wrangler reader.** Makes a site keep
  a second config file per target, which Workers Builds does not need.
- **Plumix's own reader of `env` and `previews`.** Would have to track
  wrangler's inheritance rules by hand; wrangler's reader is the definition.
- **Make `wrangler d1 migrations apply` work against Plumix's histories.**
  Rejected by ADR 0027: each owner's history applies through Plumix's drizzle
  migrator.
- **Detect a preview build from `WORKERS_CI_BRANCH`.** Implicit: a build that
  misreads its branch writes to the wrong database without a flag saying so.
