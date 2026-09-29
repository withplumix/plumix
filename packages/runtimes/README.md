# Runtime adapters

Each folder here is one runtime adapter: the package that runs a Plumix site on that runtime, built
on the runtime's own primitives
([ADR 0019](../../docs/adr/0019-a-runtime-adapter-uses-its-runtimes-primitives-and-is-tested-on-that-runtime.md)).
The shared suites know no runtime. An adapter tells them how to run it through the `plumix` block
in its `package.json`.

## `plumix.scaffold`

What `create-plumix-app` writes into a new project that picks this runtime: imports, config slots,
dependencies, files, and the `packageManager` the project installs with (pnpm by default).

## `plumix.e2e`

What the e2e suites and the scaffold smoke need to run a built site on this runtime:

- `start` is the shell command that serves the built output, with `PORT` set to an ephemeral port.
- `wipe` lists what a playground run deletes first.
- `database` says where the run's database ends up.
- `cli` is the command prefix that runs the `plumix` CLI, and defaults to the package's bin.

The e2e config helper, `definePlumixE2EConfig`, reads this block. Its baked command applies
migrations through `plumix migrate apply`, which the CLI hands to the runtime.

## Proving an adapter

An adapter has a `playground/` of its own that runs the one shared runtime spec, `runtimeSpec` from
`plumix/test/playwright`, rather than a copy of it.

The scaffold smoke (`pnpm --filter create-plumix-app smoke:scaffold`) builds a project for each
runtime, runs `migrate generate` and `migrate apply --local` through `cli`, starts `start`, and
requests `/`, the admin shell and the `auth/session` RPC.
