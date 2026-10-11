# Tests come in three tiers

Plumix grew five places a test could go: Node unit tests, a Chromium unit
tier (`*.browser.test.*`, ADR 0021), a post-build tier (`*.build.test.ts`,
`pnpm test:build`), Playwright e2e and the scaffold smoke. None of the extra
tiers was chosen as a tier. The Chromium tier came out of an upload bug that
lived only in Vitest's jsdom glue (#2432): a `File` crossing from jsdom's realm
into Node's `fetch` lost its bytes and its name. Plain Node never had that
bug, and `plugin-rpc-cases.ts` already sends a real `File` through
`stubPluginRpc` in Node. The post-build tier grew one suite at a time, wherever
a test happened to need `dist/`. With no rule for where a test belongs, each
new test copied its neighbour: 113 browser files, 18 build suites, a Chromium
download in the unit job, and an extra required CI job (#3035, #3036).

> **A test belongs to one of three tiers, chosen by what it needs to observe
> the behaviour. A unit test checks logic through a public API in one process,
> on source. An e2e test drives a running site in a real browser. A smoke step
> checks that a project scaffolded from the packed tarballs installs, builds,
> starts and answers. Each tier has one location, one runner and one CI job, a
> behaviour is tested in the lowest tier that can observe it, and checks that
> do not run code are gates, not tiers.**

`CODING_STANDARDS.md#tests` is the working rule: the placement questions, what
each tier may touch, the test-double order and the TDD loop. This record keeps
the reasons.

## What this means

- **Unit is in-process and reads source.** Vitest, `src/foo.test.ts` beside
  `src/foo.ts`, `pnpm test:unit`, CI job `Test`. No browser, no simulated DOM,
  no child process, no network, no `dist/`, no sleeps. Real collaborators, the
  in-memory database built from the shipped migrations, a temporary directory,
  and fakes from the owning package. This is Google's small test (in one
  process, no blocking I/O) and Fowler's sociable unit test.
- **E2E is the only place a browser runs.** Playwright under a package's
  `e2e/`, `pnpm test:e2e`, CI job `Test (e2e)`. What a rendered page does when a
  user acts on it is tested here, against a running site.
- **Smoke is what a consumer installs.** `smoke:scaffold` scaffolds every
  runtime from packed tarballs, installs, typechecks, builds, migrates, starts
  and requests each one; `pnpm smoke` repeats it through a throwaway registry
  before a release. A new smoke check is a step in that loop, so every runtime
  gets it. It asserts that the project works, not how a feature behaves.
- **Gates are not tiers.** Typecheck, lint, format, knip, publint, attw,
  `i18n:check`, `migrations:check` and the link check examine code without
  running it. A new check of that kind joins one of them.
- **Doubles follow the owner.** Real implementation first, then a fake the
  owning package ships in its test kit and tests, then a stub only at a boundary
  Plumix does not own (third-party HTTP, the mail transport, the clock,
  randomness, a platform global). Module mocking stays banned
  (`plumix/no-module-mocking`). The conformance suites are how a runtime's
  slots, and the fakes standing in for them, stay faithful.
- **Runtime adapters keep ADR 0019's rule** that runtime-touching code is tested
  on its runtime: an adapter's unit suite runs on that runtime and passes the
  conformance suites, its playground runs the shared runtime e2e spec, and the
  smoke starts its built server.

## Considered options

- **Keep the Chromium unit tier for components** (ADR 0021, and Vitest's own
  advice for component tests). Rejected for Plumix: the upload bug it was
  adopted for is a Node test, 18 of the 113 files never needed a browser, about
  39 cover features the e2e suites already drive, and the tier puts a browser
  download and browser start-up into every unit run. A component's logic is
  tested where it lives; the DOM is tested where a user meets it.
- **Return to jsdom or happy-dom for rendering.** Rejected: Vitest's jsdom
  bridge still drops a `File`'s name and vitest#9135 is open; happy-dom's
  `Request` dropped `Origin` and `Cookie` and its parser let `<script>` past the
  sanitizer (#2432). A simulated DOM is faithful to neither Node nor a browser.
- **Keep a post-build tier.** Rejected: none of Vite, Astro, Nuxt, Nitro,
  SvelteKit, Next.js, React Router, Hono or TanStack keeps one. Fixture-build
  assertions sit in their normal test command or their e2e build mode, real CLI
  runs per runtime sit in their integration or per-runtime jobs, and scaffolder
  tests stub the install. Each of Plumix's build suites is either logic (unit)
  or a property of an installed project (smoke).
- **Retire Vitest.** Rejected: `node:test` cannot run TSX or Vite transforms
  and its coverage and module mocks are experimental, Bun's DOM testing brings
  back happy-dom, and none of the projects above dropped Vitest or Jest.

## Consequences

- Supersedes ADR 0021 in full: the Chromium tier, the separate
  `*.build.test.ts` run and the `browser` build of `plumix/test` are retired.
- Supersedes the "How a runtime is tested" section of ADR 0019 where it names a
  build-lane suite that spawns the built server: those process facts are smoke
  steps. Its other three layers stand.
- The 113 `*.browser.test.*` files move to unit or e2e (#3035), and the 18
  `*.build.test.ts` suites move to unit or smoke (#3036).
- The `plumix/test-tier` lint rule points a DOM-touching unit test at a
  function to call and at `e2e/`, not at a browser tier.

## Sources

- Google, _Software Engineering at Google_, ch. 11–14 (test size and scope,
  unit testing, test doubles, larger testing).
- Martin Fowler and Ham Vocke, "The Practical Test Pyramid"; Fowler,
  "UnitTest", "Mocks Aren't Stubs", "TestDouble", "ContractTest",
  "Eradicating Non-Determinism in Tests".
- Kent Beck, "Canon TDD" and "Test Desiderata".
- Gerard Meszaros, _xUnit Test Patterns_; Vladimir Khorikov, _Unit Testing
  Principles, Practices, and Patterns_; Freeman and Pryce, _Growing
  Object-Oriented Software, Guided by Tests_.
- The test guidance in the repositories of Vite, Vitest, Astro, Nuxt, Next.js,
  SvelteKit, React Router, Hono, Nitro, TanStack Router, Prisma, VS Code and
  Payload.
