---
"plumix": minor
---

Adds `parsePortFlag(flag, raw)` to `plumix/cli`, which reads a `--port`-style flag's value or throws a `CliError` (`port_flag_missing_value`, `port_flag_out_of_range`). `plumix dev` on a self-hosted runtime now reports a bad `--port` or an empty `--host=` through the CLI's `code: message` report instead of as an unexpected crash.

Breaking: `CliError`'s constructor is now protected, so a package declares its own error codes on a subclass (`class MyCliError extends CliError<"my_code">`). The static factories only the `plumix` CLI and the Cloudflare runtime threw are gone from the published class; `spawnFailed`, `spawnNonzeroExit` and the two raw SQL migration factories remain. Every code, message and hint the CLI prints is unchanged.
