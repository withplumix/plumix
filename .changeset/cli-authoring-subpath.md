---
"@plumix/runtime-cloudflare": minor
"@plumix/core": minor
"plumix": minor
---

Publish the CLI command-authoring surface on its own subpath, `plumix/cli` (and `@plumix/core/cli` behind it): `CliError`, `isCliError`, `spawnInherit` and `spawnCapturingStderr`, the pieces a runtime adapter needs to contribute a command.

The `plumix` binary previously loaded core's root barrel before parsing a flag — ~500ms of drizzle, schema and auth — for a single symbol, `buildApp`, that a command declaring `deferApp` never calls. `buildApp` is now deferred, and `plumix --version` runs in 93ms against 586ms before.

Commands that read `plumix.config.ts` are unchanged, because loading the config pulls the runtime adapter and so core with it.

`@plumix/runtime-cloudflare` now imports `plumix/cli`, so its `plumix` peer floor moves to `>=0.21.0` — the first version that publishes the subpath. Without that, the wide `0.x` peer range would let the new adapter install against a `plumix` that cannot resolve it, and `deploy`, `migrate apply` and `types` would fail at runtime.
