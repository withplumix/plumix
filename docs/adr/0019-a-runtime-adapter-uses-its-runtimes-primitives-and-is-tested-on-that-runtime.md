# A runtime adapter uses its runtime's primitives and is tested on that runtime

Plumix runs on Cloudflare Workers and on Node, and Bun is next (#2675). A spike
ran the Node runtime under Bun 1.4.2 and it failed three ways. The built entry
bound two listeners on one port and answered every request 500. The request
bridge read Bun's plain sockets as HTTPS, so same-origin POSTs failed the CSRF
check. And the Node runtime's own suite failed 11 tests. Each was a place where
Node-shaped code assumed something only Node does, and each passed every test
we had, because every test ran on Node.

The Node runtime also discards what Bun ships: a server, SQLite, an S3 client, a
cron scheduler and an image pipeline, all built in. The reason to add a runtime
at all (#2152) is to use those rather than re-implement them in userland.

> **A runtime adapter is built on its runtime's own primitives, and it is tested
> on that runtime. Where a built-in falls short of the contract, the portable
> implementation fills exactly that gap and nothing more.**

- **Native first.** Bun's runtime serves with `Bun.serve`, stores with
  `bun:sqlite`, `Bun.file` and `S3Client`, schedules with `Bun.cron` and resizes
  with `Bun.Image`. It does not run the Node runtime's `node:http` bridge.
- **The portable implementation fills a gap, never the whole slot.** Bun's
  presign signs only `host` and does not enforce the content type, so
  `presignPut` alone delegates to core's portable presigner while every other
  S3 operation stays on `S3Client`. Bun's `run().changes` counts rows written by
  triggers, so the SQLite slot reads `changes()` after a write and keeps Bun's
  driver for everything else.
- **What every runtime decides alike lives in core, once.** The request trust
  rules, the asset-serving rules and the drain deadline are published on
  `plumix/runtime` (#2681). They are Web APIs only, since they sit on the
  request path. The runtime supplies what only it knows, such as the scheme its
  listener accepted and the bytes on its disk, rather than core sniffing a
  socket. The Node runtime's socket check was what reported HTTPS under Bun.

## How a runtime is tested

A fake built-in shares the assumption under test and cannot fail. So
runtime-touching code is tested on the runtime, and nothing substitutes the
runtime's API. There are four layers, highest first.

1. **Shared runtime e2e.** Each runtime's playground runs the same Playwright
   spec in dev on that runtime. The spec bootstraps the first admin, publishes an
   entry, reads it publicly, uploads media and signs out. Every runtime is proven
   by the same assertions.
2. **The spawned built server.** A build-lane suite builds a consumer project and
   starts its server with the runtime's own binary on an ephemeral port. It
   asserts the process facts no unit test can see: one listener, drain on
   `SIGTERM`, the deadline exit, timeouts, body limits and trust.
3. **Conformance suites on the runtime itself.** The package's unit suite runs on
   the runtime, and each slot runs the shared conformance suite for its
   contract. Those suites cover object storage, assets and the database.
4. **The scaffold smoke start step.** For every runtime, the smoke job installs
   the scaffold from packed tarballs, builds it, then starts the built server and
   requests it. A runtime that builds but cannot serve fails CI.

**The conformance suites are the contract.** `plumix/test/conformance` is what
every runtime passes, not a sample of it. A new adapter is held to the same
cases as the ones already shipped. A divergence a runtime shows, like Bun's row
count, becomes a failing case in the suite rather than a note in one adapter.

## Considered options

- **Run the Node runtime on Bun** (rejected). It failed on first contact, and
  under a compatibility layer each fix would chase a divergence rather than use
  the primitive that avoids it.
- **One portable adapter over Web APIs for every self-hosted runtime**
  (rejected). It throws away the built-ins that are the reason to pick the
  runtime, and it still needs per-runtime code for the server, the database and
  the disk. That per-runtime code is where the spike's failures were.
- **Test a runtime against fakes of its built-ins, on Node** (rejected). The
  spike's 11 failures were real divergences that only the real runtime
  exposed. A fake encodes the author's belief about the built-in, which is the
  thing under test.
