// Separate from `./index.ts`, which is the CLI the `plumix` binary runs — that
// one reaches for `loadConfig`, and so for jiti and valibot, which a command
// author has no use for. Re-exported here rather than pointing consumers at
// `@plumix/core/cli`: no package under `plugins/` or `runtimes/` depends on
// core directly, and cloudflare declares only `plumix` as a peer.
//
// Named rather than `export *`, so this stays the four symbols the docs
// promise. Core's `cli` barrel also carries the raw-migration and
// schema-codegen helpers, but the only consumer of those is this package's own
// `migrate` command, which imports `@plumix/core/cli` directly.
export { CliError, isCliError } from "@plumix/core/cli";
export { spawnCapturingStderr, spawnInherit } from "@plumix/core/cli";
