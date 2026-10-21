# Migrations

Migrations bring a site's database to the schema and data shape its installed code expects. Each
table owner (core, a plugin, the site's own tables) ships its own drizzle-generated history, and any
owner may ship TypeScript data migrations that run after every schema migration. Package
maintainers generate and commit histories; a site developer meets them through `plumix dev` and
`plumix migrate`; an operator through `plumix deploy` or a built Node or Bun server's start. The
runner lives in `packages/plumix/src/cli/migrate/` and `packages/plumix/src/cli/commands/migrate.ts`.
Each runtime opens its own database through `RuntimeMigrations` in its commands module.

## At a glance

```mermaid
flowchart LR
  owners["resolveOwners: core, plugins, site"] --> schema["drizzle migrator, one tracking table per owner"]
  schema --> data["data migrations, same owner order"]
  data --> track["__plumix_data_migrations"]
  dev["plumix dev"] --> owners
  migrate["plumix migrate"] --> owners
  deploy["plumix deploy (Cloudflare)"] --> owners
  start["built Node/Bun start"] -->|applyBuiltMigrations| owners
```

## Surface

| Piece                                                    | What it is                                                                                         | Public                                                          |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `plumix migrate`                                         | Apply every owner's schema, then data migrations; prints a plan and confirms before a remote write | yes (CLI)                                                       |
| `plumix migrate status`                                  | Applied and pending migrations per owner                                                           | yes                                                             |
| `plumix migrate fresh`                                   | Wipe and re-apply; refuses any production target (`migrateFreshProduction`)                        | yes                                                             |
| `plumix migrate generate`                                | Write the site's next migration for its own tables                                                 | yes                                                             |
| `defineDataMigration({ name, up })`                      | One forward-only step; `up({ db })` gets drizzle with no schema                                    | yes, `plumix/db`                                                |
| `PluginDescriptor.schemaModule` / `dataMigrations`       | A plugin's tables module and its data migrations module                                            | yes, `plumix/plugin`                                            |
| `PlumixConfig.dataMigrations`                            | The site's data migrations module, relative to the config                                          | yes                                                             |
| `RuntimeMigrations`                                      | `targetOptions?`, `legacyTable`, `open`, `openRun`                                                 | yes, `plumix/cli`                                               |
| `MigrationDatabase`                                      | `migrate`, `drizzle`, `all`, `batch`, `wipe`, `restorePoint?`, `close`, `target`                   | yes, `plumix/cli`                                               |
| `applyBuiltMigrations`                                   | What a built Node or Bun server runs before it listens                                             | yes, `plumix/cli`                                               |
| `migrateBeforeDeploy`, `migrateForDev`                   | The deploy and dev entry points                                                                    | `migrateBeforeDeploy` on `plumix/cli`; `migrateForDev` internal |
| `applyCoreTestSchema`, `applyTestSchema`, `createTestDb` | Test DDL from the shipped histories                                                                | yes, `plumix/test`                                              |
| `pnpm migrations:check`                                  | Runs `db:generate` in every package that has one; fails when `migrations/` changes                 | repo only                                                       |

## How it works

`resolveOwners` lists the owners in application order: core first, then plugins in config order,
then the site. A plugin owns a history when its `schemaModule` resolves into an installed package;
one that resolves inside the site's package counts as the site's (`sitePlugins`). Each history
applies through drizzle's own migrator under `__drizzle_migrations_<owner>`. Plumix chooses only
folders, tracking tables and order (ADR 0027). Data migrations then run in the same owner order.
Each is recorded by owner and name in `__plumix_data_migrations` once `up` resolves. A failure
stops the run and is not recorded (ADR 0044).

`plumix dev` calls `migrateForDev`. It writes the site's next migration when the site's tables are
ahead of its history, says to commit it, and applies everything locally. `plumix migrate` checks the
site's history for drift first (`checkSiteDrift`). A database built from a legacy single history is
adopted when its schema matches the owner histories. The marker is the runtime's `legacyTable`:
`d1_migrations` on Cloudflare, `__drizzle_migrations` on Node and Bun. Hand-written DDL is an
ordinary custom migration in its owner's history, such as the search plugin's FTS5 table in
`packages/plugins/search/migrations/0001_search_index.sql`. No separate raw-SQL declaration exists.

- `packages/plumix/src/cli/migrate/owners.ts`: `resolveOwners`, `TRACKING_TABLE_PREFIX`, `sitePlugins`.
- `packages/plumix/src/cli/migrate/apply.ts`: `applyOwners`, `adoptLegacyDatabase`, `reportStatus`.
- `packages/plumix/src/cli/migrate/data.ts`, `data-load.ts`, `data-modules.ts`: `DATA_MIGRATIONS_TABLE`, `applyDataMigrations`.
- `packages/plumix/src/cli/migrate/built.ts`: `copyOwnerHistories`, `applyBuiltMigrations`.
- `packages/core/src/db/data-migration.ts`: `defineDataMigration`. `packages/core/src/cli/data-migrations.ts`: `CORE_DATA_MIGRATIONS`, empty today.
- `packages/core/src/cli/migrations.ts`: `CORE_MIGRATIONS_FOLDER`. `packages/core/migrations/`: core's history, `0000_tables` to `0003_edit_leases`.
- `packages/runtimes/*/src/commands/migrations.ts`: each runtime's `open`/`openRun`. Cloudflare resolves `--production`/`--preview`/`--env` through wrangler's config reader (ADR 0045).
- `packages/core/src/test/harness.ts`: `applyCoreTestSchema` replays `CORE_MIGRATIONS`, the shipped history, with the driver's own drizzle migrator.
- `.github/scripts/migrations-check.mjs`: the `migrations:check` script, run in `.github/workflows/ci.yml`.

## Invariants

- One drizzle history per owner, one tracking table per owner, order core → plugins → site. Plumix never deletes or rewrites a history. [ADR 0027](../adr/0027-each-table-owner-ships-its-own-migration-history.md); `packages/plumix/src/cli/commands/migrate.test.ts`.
- A package's declared tables are never ahead of its shipped history. `pnpm migrations:check` in CI.
- Data migrations run after every schema migration, go forward only, and never reach a request bundle. [ADR 0044](../adr/0044-data-migrations-run-in-typescript-after-every-schema-migration.md); `packages/core/src/db/data-migration.test.ts`, `packages/plumix/src/vite/data-migrations-bundle.test.ts`, `packages/plumix/src/vite/server-bundle-data-migrations.test.ts`.
- A remote target is named in the platform's terms, and a remote write prints a plan and is confirmed. [ADR 0045](../adr/0045-a-runtime-names-its-remote-databases-from-its-platform-config.md).
- The Cloudflare Worker applies nothing at runtime; `plumix deploy` migrates from the CLI first (`migrateBeforeDeploy` in `packages/runtimes/cloudflare/src/commands/deploy.ts`).
- Test databases get core's DDL from the same history production replays (`packages/core/src/test/harness.test.ts`).
- Every runtime's `openRun` reaches the same database `migrate` wrote: `describeRunContract` in each `packages/runtimes/*/src/commands/migrations.test.ts`.

## Status

- Shipped: per-owner histories for core and the audit-log, comments, forms and search plugins (each has `migrations/` and a `db:generate` script). Also legacy adoption, `migrate status`/`fresh`/`generate`, data migrations end to end, migrations at built Node/Bun start, and Cloudflare remote targets.
- e2e: `packages/runtimes/cloudflare/e2e/migrate-fresh.spec.ts`.
- Open: #2829 (adopt `apps/marketing`'s production D1 and deploy through `plumix deploy`), #3223 (`plumix deploy --help` builds and migrates production).
- No data migration is shipped yet: `CORE_DATA_MIGRATIONS` is `[]`, and no first-party plugin sets `dataMigrations` (`grep -rn dataMigrations packages/plugins/*/src` is empty).

## Gaps

- Core defines its history folder twice: `CORE_MIGRATIONS_FOLDER` in `packages/core/src/cli/migrations.ts` and `CORE_MIGRATIONS` in `packages/core/src/test/harness.ts`. Both point at `../../migrations`.
- The two tracking-table namers disagree in form. The CLI's `trackingSuffix` (`owners.ts`) uses the package name. The harness's `trackingTable` uses the history's parent folder name. They match only while each package's folder is named like its package.
- `migrations:check` covers only packages with a `db:generate` script. A site's own drift is checked by `checkSiteDrift` at `plumix migrate` time, not in this repo's CI.
