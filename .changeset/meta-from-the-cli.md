---
"plumix": minor
"@plumix/runtime-cloudflare": minor
"@plumix/runtime-node": minor
"@plumix/runtime-bun": minor
---

`plumix meta report` and `plumix meta settle` now work on Cloudflare. They reach the local D1 that `plumix dev` uses, or the deployed one `--production`, `--preview` or `--env <name>` names, with `--binding` when there are several, the same as `plumix migrate`. A settle against a deployed database prints what it would settle and asks first. `--yes` skips the question, and `--dry-run` stops after the plan. Removes the admin's **Management → Field values** page and the `meta.sweep` RPC it called: run `plumix meta settle` instead. Opening an entry, term or user still converts its own values. A runtime adapter's `RuntimeMigrations` now implements `openRun`, which returns the env `plumix meta` runs the site's handler in, so upgrade `plumix` and the runtime adapter together.
