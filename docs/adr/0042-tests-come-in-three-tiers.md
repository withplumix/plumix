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
new test copied its neighbour: 112 browser files, 18 build suites, a Chromium
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

- **Unit is Google's small test and Fowler's sociable unit test**: one process,
  no blocking I/O, real collaborators. A Plumix rule is mostly logic over data,
  so the in-memory database and the owning package's fakes reach almost every
  behaviour from Node, fast and without a build.
- **E2E is the only place a browser runs**, because a real page is the only
  thing faithful to a browser. A rendered component is tested where a user meets
  it, and its logic is tested where it lives.
- **Smoke is what a consumer installs.** Packed tarballs, the runtime's package
  manager and the runtime's own binary are what no other tier sees, so smoke
  checks those and nothing about features.
- **Gates are not tiers.** A check that examines code without running it joins
  an existing gate, so a new kind of check never becomes a new kind of test.
- **ADR 0019's runtime rule holds in all three tiers**: an adapter's unit suite
  runs on its runtime and passes the conformance suites, its playground runs the
  shared runtime e2e spec, and smoke starts its built server.

## Considered options

- **Keep the Chromium unit tier for components** (ADR 0021, and Vitest's own
  advice for component tests). Rejected for Plumix: the upload bug it was
  adopted for is a Node test, 18 of the 112 files never needed a browser, about
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
- Supersedes layer 2 of ADR 0019's "How a runtime is tested", the build-lane
  suite that spawns the built server: its request rules (timeouts, body limits,
  trust) are unit tests of the handler, and starting with one listener,
  answering and exiting within the deadline on `SIGTERM` are smoke steps, which
  #3036 adds. Its other three layers stand.
- The 112 `*.browser.test.*` files move to unit or e2e (#3035), and the 18
  `*.build.test.ts` suites move to unit or smoke (#3036).
- The `plumix/test-tier` lint rule points a DOM-touching unit test at a
  function to call and at `e2e/`, not at a browser tier.

## Sources

- Google, [_Software Engineering at Google_](https://abseil.io/resources/swe-book),
  ch. 11–14: test size and scope, unit testing, test doubles, larger testing.
- Ham Vocke, ["The Practical Test Pyramid"](https://martinfowler.com/articles/practical-test-pyramid.html);
  Martin Fowler, ["UnitTest"](https://martinfowler.com/bliki/UnitTest.html),
  ["Mocks Aren't Stubs"](https://martinfowler.com/articles/mocksArentStubs.html),
  ["TestDouble"](https://martinfowler.com/bliki/TestDouble.html),
  ["ContractTest"](https://martinfowler.com/bliki/ContractTest.html),
  ["Eradicating Non-Determinism in Tests"](https://martinfowler.com/articles/nonDeterminism.html).
- Kent Beck, ["Canon TDD"](https://newsletter.kentbeck.com/p/canon-tdd) and
  ["Test Desiderata"](https://testdesiderata.com/).
- Gerard Meszaros, _xUnit Test Patterns_; Vladimir Khorikov, _Unit Testing
  Principles, Practices, and Patterns_ and
  ["When to mock"](https://enterprisecraftsmanship.com/posts/when-to-mock/);
  Freeman and Pryce, _Growing Object-Oriented Software, Guided by Tests_.
- Robert C. Martin, _Clean Code_, ch. 9 (F.I.R.S.T., one concept per test,
  clean tests); Michael Feathers,
  ["Characterization Testing"](https://michaelfeathers.silvrback.com/characterization-testing);
  Kent Beck, ["Structure and behavior PRs"](https://newsletter.kentbeck.com/p/structure-and-behavior-prs).
- Microsoft, [unit testing best practices](https://learn.microsoft.com/en-us/dotnet/core/testing/unit-testing-best-practices),
  ["Shift left"](https://learn.microsoft.com/en-us/devops/develop/shift-left-make-testing-fast-reliable)
  and the [Code-With Engineering Playbook](https://microsoft.github.io/code-with-engineering-playbook/automated-testing/);
  Google's [code review guide](https://google.github.io/eng-practices/review/reviewer/looking-for.html);
  [DORA test automation](https://dora.dev/capabilities/test-automation/).
- Flaky tests: [Meta](https://engineering.fb.com/2020/12/10/developer-tools/probabilistic-flakiness/),
  [Spotify](https://engineering.atspotify.com/2019/11/test-flakiness-methods-for-identifying-and-dealing-with-flaky-tests/),
  [Shopify](https://shopify.engineering/unreasonable-effectiveness-test-retries-android-monorepo-case-study);
  Thoughtworks Radar, ["Snapshot testing only"](https://www.thoughtworks.com/radar/techniques/snapshot-testing-only).
- Where other frameworks put the same tests, from each repository's scripts and
  CI: Vite's playground `test-build` mode (`vitejs/vite` `.github/workflows/ci.yml`),
  Astro's `fixture.build()` tests (`withastro/astro` `packages/astro/test/`),
  Nuxt's `test/bundle.test.ts`, Nitro's `test/minimal` and `test/presets`,
  SvelteKit's `test:dev`/`test:build` apps, Next.js's `test/production` and
  [testing guide](https://github.com/vercel/next.js/blob/canary/contributing/core/testing.md),
  React Router's `integration/vite-build-test.ts`, Hono's per-runtime jobs, and
  the `create-*` tests of Vite, Astro, Nuxt and React Router, which stub the
  install.
