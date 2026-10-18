---
"plumix": minor
---

Removes `--remote` from `plumix migrate` on every runtime. A runtime now declares the target options that name its deployed databases (`targetOptions` on its `migrations` and `sync` exports), which `migrate`, `sync` and `import` accept and `plumix --help` lists, and any other option fails with `unknown_option`, naming the runtime. A `migrate` that writes to a deployed database prints the target and its pending migrations first and asks before applying, with `--yes` to skip the question and `--dry-run` to stop after the plan; without a terminal and `--yes` it refuses with `migrate_unconfirmed`. On Cloudflare, a CI script that ran `plumix migrate --remote` now runs `plumix migrate --production --yes`. For runtime authors: `MigrationLocation` is `"site" | "memory"`, `open` receives `targetValues`, a `MigrationDatabase` names itself in `target`, and `migrateBeforeDeploy(ctx, targetValues)` takes the database to migrate.
