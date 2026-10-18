---
"plumix": minor
---

Changes `plumix migrate fresh` to drop every table in the database, then run the normal migrate, instead of deleting the runtime's local state files, so uploads stay where they are. It prints the tables it drops and the migrations it applies, and asks before dropping: `[y/N]` locally, and typing the database's name on a deployed one. `--yes` skips the question, `--dry-run` stops after the plan, and without a terminal and `--yes` it refuses with `migrate_fresh_unconfirmed`. A script that ran `plumix migrate fresh` now runs `plumix migrate fresh --yes`. On Cloudflare it also rebuilds a `--preview` or `--env <name>` database, after printing its D1 Time Travel restore point. `--production` and `--env production` are always refused. `definePlumixE2EConfig` now deletes the runtime's `plumix.e2e.wipe` paths itself and runs `migrate fresh --yes`. For runtime authors: a `MigrationDatabase` now has `wipe()`, an optional `restorePoint()`, and `target.name`.
