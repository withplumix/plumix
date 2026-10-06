# The context carries config once

Adding the `dev` slot in #2445 took eight edits that did nothing but thread it
through. The slot was declared on `PlumixConfigInput`, restated on `PlumixConfig`,
copied key by key in `plumix()`, copied again into the request-context arguments,
declared on `AppContext` and on `createAppContext`'s arguments, assigned, and
restated as a flat option of the dispatcher test harness. `basePath`, `i18n`,
`imageRemotePatterns` and `siteName` had each taken the same route onto the
context, and `auth()` listed its options four times (#2471).

> **`ctx.config` is the app's resolved `PlumixConfig`, the same object as
> `app.config`. A value the operator wrote in `plumix.config.ts` is read at
> `ctx.config.<slot>` and is never copied to the top level of the context.**

The top level of the context holds only two kinds of thing:

- **Per-request state**: `request`, `user`, `locale`, `origin`, `telemetry`,
  `resolvedRoute` and the other members a request writes or resolves.
- **Services**: things the app built, bound or resolved from config, such as
  `storage`, `cdn`, `kv`, `imageDelivery`, `mailer`, `dev`, `authenticator` and
  `authMethods`. A slot that binds to the platform appears twice, and the two
  are not the same thing: `ctx.config.storage` is the adapter the operator
  wrote, `ctx.storage` is the store it connected to for this request.

Laravel draws the same line: `config('app.url')` for configuration, the
container for services. ADR 0003 drew it for `dev` in #2450, where `ctx.dev` is
the resolved `DevRuntime` and the raw input stays at `app.config.dev`. This
record extends it to every slot.

## Consequences

A new pass-through slot is declared once, on `PlumixConfigInput`, and reaches
every handler and plugin without another edit. `PlumixConfig` is derived from
the input: it names only the six slots `plumix()` resolves (`theme`,
`plugins`, `i18n`, `redirects`, `routes`, `basePath`) and inherits the rest, and
`plumix()` spreads the input rather than naming slots. `PlumixAuthConfig` is
`PlumixAuthInput` plus its `kind`, and `auth()` spreads its input the same way.
The documented input interface is the single source because its per-option
JSDoc is what an author sees on hover. The valibot schema validates only the
options that have checks and is typed against the input, so a schema key that
isn't an option fails to compile.

The test harnesses follow the rule. `createDispatcherHarness`, `createRpcHarness`
and `createTestContext` take config slots under `config`, resolved through
`auth()` and `plumix()`. Only connected services such as `storage`, `kv` and
`cdn` stay top-level options.

## Why no aliases

The copies were removed outright, with no `ctx.basePath` kept as a convenience
beside `ctx.config.basePath`. A mirror field for the "common" slots would reopen
the question for every new slot, since someone has to decide whether it is
common enough to copy, and the copies are how the eight edits accumulated in
the first place. TypeScript fails at compile time on every removed member, and
the changeset records the move.

## What never reads it whole

Nothing serializes `ctx.config` whole. It carries the `auth` providers' client
secrets and the mailer transport. The dev snapshot, the debug panels and the dev
error page keep picking named fields, such as `basePath` and the magic-link
`siteName`, into their own serializable shapes.
