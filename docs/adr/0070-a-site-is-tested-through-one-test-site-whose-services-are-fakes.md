# A site is tested through one test site whose services are fakes

A developer testing a Plumix site or plugin had three partial harnesses and no
whole one (#3439). `createTestContext`, `createRpcHarness` and
`createDispatcherHarness` each covered part of the job: the RPC harness could not
install plugins and its client knew only core's procedures, and the dispatcher
harness had no context and could not act as a user. Outbound fetches, the logger,
telemetry, time and scheduled tasks had no fake, so tests stubbed the global
`fetch`, rebuilt capturing loggers, froze `Date` with fake timers and called a
scheduled task by its index in the registry. E2E shared one database per
playground on one worker, restored a snapshot before each test, needed a
hand-kept port registry and seeded everything in `globalSetup`.

> **A site is tested through one test site, booted by `testSite()` from
> `plumix/test`. It runs on in-memory SQLite, migrated once and emptied before
> each test, and every slot it has is a fake that records what the site did and
> asserts on it. Unit and feature tests run on Vitest. There is no option to test
> against a real runtime. E2E serves the same test site inside the Playwright
> worker, on Node.**

## What this means

- **One entry point.** `testSite()` with no arguments boots the project's own
  `plumix.config.ts`; with `{ plugins, factories, env, config }` it boots core
  plus what it is given. A unit test that calls a service directly reaches it
  through `site.context`, so there is no second helper. The three harnesses are
  removed once Plumix's own suites have moved, with no shims.
- **In-memory SQLite, always.** Whatever database the config names, the test
  site runs on in-memory SQLite, so a test never touches a file or the
  developer's data. Each test file migrates one database once, and before each
  test a script built once from the schema empties every table, plugins'
  included, restarts ids and clears what triggers and the search index wrote. A
  serial chain of e2e steps resets once at its start. When the config uses
  `d1()`, the database refuses what D1 refuses: a statement over D1's
  bound-parameter cap and an interactive transaction.
- **A fake for every slot.** Mail, CDN, storage, outbound fetch, logger,
  telemetry, time, scheduled tasks, events and filters each come with a fake.
  A fake's assertions are its own methods and throw a plain `Error` naming what
  was expected and what was found, so the kit works under any test runner. A
  site's platform bindings are faked through `env`. A runtime's slots and the
  fakes pass the same conformance suites (ADR 0019), which keeps the fakes
  honest.
- **Time belongs to the site.** Core reads time through one clock that follows
  the current site, so moving one test site's clock leaves every other site and
  real time alone.
- **Vitest.** Unit and feature tests run on Vitest, in the `unit` and `feature`
  projects `defineTestConfig()` defines.
- **E2E is served in process on Node.** The Playwright fixture boots the test
  site inside each worker, on its own in-memory database and port 0, whatever
  runtime the site deploys to. A spec uses the same `site`, factories and fakes
  as a feature test and seeds its own data. The HTTP server it serves through is
  exported by `@plumix/runtime-node`, since the server is that adapter's
  primitive (ADR 0019).

## Considered options

- **Roll back a transaction after each test.** Rejected: the libsql client's
  pool rolls back on release, and an outer transaction held open for the test
  blocks every other query, so `db.transaction` and `db.batch` in the code under
  test would not work.
- **Copy a template database before each test.** Rejected: libsql implements
  neither `serialize` nor `backup`, so there is nothing to copy from. Emptying
  the tables measured 0.15 ms with core and four plugins, against 4.6 ms for a
  fresh migration (the #3439 spike's per-test reset comparison).
- **A fresh database per test.** Rejected: in the #3439 spike, migrations were
  80–90% of the old harnesses' set-up cost, and emptying the tables is as correct.
- **`node:test` in place of Vitest.** Rejected: it cannot transform JSX,
  resolve `.js` to `.ts` or run the Vite plugin pipeline a site's code needs,
  and it has no `expectTypeOf`. Mutation testing (ADR 0049) runs on Vitest too.
  ADR 0042 rejected retiring Vitest for the same reasons.
- **An option to test against the real runtime**, such as Cloudflare's bindings
  under workerd. Rejected for now: the fakes plus the D1 limits reach every case
  found so far, and a second mode doubles what each test can mean. It can return
  when someone shows a case these rules do not cover. A runtime adapter is still
  tested on its runtime (ADR 0019).
- **E2E against an out-of-process server per playground**, as before. Rejected:
  one shared file database forces one worker, a snapshot restore between tests
  and a port registry, and a site's own e2e would migrate the developer's dev
  database. In-process serving gives each worker its own database and port.

## Consequences

- ADR 0042 is amended: unit and feature tests are two kinds within its unit
  tier, and it names where each kind of test lives.
- ADR 0019 is amended: playgrounds run on Node, except the runtime adapters'
  own, which prove their runtimes.
- The in-memory database has a single connection. Code that holds a
  transaction open across an `await` while another request arrives fails in a
  test instead of waiting. If that bites, the fix belongs in the test database
  slot, not in a second mode.
- E2E always serves on Node, so a behaviour only a deployed runtime shows is
  caught by that runtime's own playground and the smoke, not by a site's e2e.
