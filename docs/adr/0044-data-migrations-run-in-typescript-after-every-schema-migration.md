# Data migrations run in TypeScript after every schema migration

A plugin release that changes the shape of data it already stored (renames a
settings key, reshapes JSON meta, backfills a value) had one way to upgrade
existing sites: a hand-written SQL migration in its drizzle history
(`drizzle-kit generate --custom`). That is a dead end twice over (#3066):

- **SQL only.** Settings are `group`/`key`/`value` rows and meta is a JSON
  column, so every reshape is hand-written `json_set`/`json_extract`, with none
  of the plugin's own TypeScript.
- **Tables only.** [ADR 0027](./0027-each-table-owner-ships-its-own-migration-history.md)
  gives an owner a history only when it declares tables. A plugin that stores
  only settings and meta has nowhere to put even the SQL.

Every framework #3066 compares (Laravel with spatie/laravel-settings, Django's
`RunPython`, Craft, Shopware, Payload, Drupal's `post_update`, Medusa's
`migration-scripts`) reshapes data in the host language, and lets a package
with no tables ship such a step. Those without historical models (Drupal,
Medusa) run data steps after every schema step, because the code a step calls
matches only the finished schema; Plumix has no historical models either.
Shopware, Strapi v5 and drizzle-kit all go forward only.

> **Data is reshaped by data migrations: ordered TypeScript steps,
> `defineDataMigration({ name, up })`, whose `up({ db })` gets a drizzle
> database. Core, any plugin (with or without tables) and the site declare
> them. They run after every owner's schema migrations, wherever schema
> migrations run: `plumix dev`, `plumix migrate`, `plumix deploy`, e2e, and a
> built Node or Bun server's start. Each is recorded per owner and name once its
> `up` resolves. They only go forward. No request bundle ever contains one.**

## What this means

- **Schema stays drizzle's.** Drizzle-generated SQL, one history per owner,
  guarded by `migrations:check`, exactly as ADR 0027 decides. Only data moves to
  TypeScript.
- **Amends ADR 0027's scope.** Its owners are table owners; a data migration's
  owner need not own a table. A plugin names a module (`dataMigrations`)
  resolved like its `schemaModule`, the site names one in `plumix.config.ts`,
  and core keeps its own list. Owners use the schema owners' names: `core`, the
  package name, `site`.
- **Amends ADR 0027's list of where migrations run.** A built Node or Bun
  server applies the histories its build shipped before it listens (#2828), and
  now its data migrations after them. The Cloudflare Worker applies nothing;
  `plumix deploy` migrates from the CLI before `wrangler deploy`.
- **After all schema, in owner order.** Core, then plugins in config order, then
  the site, each list in its own order. A data migration may read any column a
  schema migration of the same run added.
- **One tracking table**, `__plumix_data_migrations` (`owner`, `name`,
  `applied_at`), created on first use. A name already recorded is skipped. A
  duplicate name within one owner fails before any data migration runs.
- **A failure stops the run.** Nothing after the failed one runs and it is not
  recorded, so the next run retries it. `up` is not wrapped in a transaction,
  because D1 cannot hold one open across TypeScript, so an `up` is written to
  run again after a partial failure.
- **Forward only.** No `down()`. A mistake is fixed by shipping a new data
  migration; rollback is restoring the database (D1 Time Travel, or a copy of
  the SQLite file). Renaming a released one runs it again.
- **Never in a request bundle.** The CLI imports the modules in its own process.
  On Node and Bun, `plumix build` bundles the plugin and site modules into
  `dist/server/migrations/data-migrations.js`, beside the histories, which the
  server imports by a URL computed at start. Core's own list travels with the
  runner. A Worker never carries one.
- **The runtime contract grows by one field.** `MigrationDatabase.drizzle` is
  the drizzle instance each adapter already builds over its driver, with no
  schema registered.

## Considered options

- **Hand-written SQL in a history, as today.** Leaves a plugin with no tables
  without a history, and every reshape in `json_set`.
- **Data steps inside each owner's run, between its schema migrations**, as
  Laravel's single stream does. Plumix has no historical models, so a step's
  code matches only the finished schema; a step that runs before a later
  owner's schema reads tables that do not exist yet.
- **Built servers apply schema only, and the operator runs `plumix migrate`.**
  Rejected: the documented runtime image has no `plumix.config.ts` to run that
  command with, and a release would serve against data nothing reshaped,
  without failing.
- **Run data migrations lazily in the worker, at request time.** Every request
  bundle would carry every migration, and a Worker cannot hold the run open.
- **Settings and meta helpers** (`settings.rename`, `meta.update`). Each would
  be an API to keep; `up` gets `db` and the author writes the query.
