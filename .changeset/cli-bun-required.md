---
"plumix": minor
---

Adds `CliError.bunRequired()` to `plumix/cli`, for a runtime whose commands run only on Bun. The CLI now reports a `CliError` thrown while a runtime's commands module loads as that error, with its own hint, rather than wrapping it as `runtime_commands_load_failed`.
