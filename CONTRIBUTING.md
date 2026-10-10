# Contributing to Plumix

Thanks for your interest in contributing! This guide gets you from a clone to a merged pull request.

By taking part you agree to the [Code of Conduct](CODE_OF_CONDUCT.md). Report a security issue privately, as [`SECURITY.md`](SECURITY.md) describes, never in a public issue.

## Before you start

- **Search the issues first.** Someone may already be working on it, or a maintainer may have decided it.
- **Ask questions in [Discussions](https://github.com/withplumix/plumix/discussions)**, not in issues.
- **Report a bug as an issue** with the smallest reproduction you can make.
- **Propose a feature or an API change as an issue** and wait for a maintainer to agree before opening a pull request. Review time is the scarcest thing this project has, and a design that was never discussed is the most likely to be sent back.
- **Before adding an option, look for another way.** Could a smarter default fix the problem? Could it be a plugin instead? Every option is a promise to maintain.

## Setup

You need:

- **Node.js**, and any other runtime the repo tests on, at the version pinned at the repo root ([`.nvmrc`](.nvmrc), `.<runtime>-version`).
- **[Corepack](https://nodejs.org/api/corepack.html)**, which ships with Node.js and installs the pnpm version the repo pins.
- **Docker**, only for the few tasks that render in a container. They say so when they need it.

```bash
git clone git@github.com:withplumix/plumix.git
cd plumix
nvm install        # installs the Node version from .nvmrc
nvm use            # activates it
corepack enable    # enables pnpm through Corepack
pnpm install
pnpm --filter @plumix/admin exec playwright install chromium   # once, for the browser test tier and e2e
```

> **Tip:** add `nvm use` to your shell's `cd` hook so it switches automatically when you enter the project. See [nvm's deeper shell integration](https://github.com/nvm-sh/nvm#deeper-shell-integration).

To improve `git blame`, run this once after cloning:

```bash
git config --local blame.ignoreRevsFile .git-blame-ignore-revs
```

To resolve merge conflicts in `pnpm-lock.yaml` automatically:

```bash
pnpm add -g @pnpm/merge-driver
pnpm dlx npm-merge-driver install --driver-name pnpm-merge-driver --driver "pnpm-merge-driver %A %O %B %P" --files pnpm-lock.yaml
```

## Development

Run everything from the repo root. The Commands section of [`AGENTS.md`](AGENTS.md#commands) lists every root script and what it does. The ones you will use most:

```bash
pnpm build        # build every package
pnpm test         # unit and build tests across the workspace
pnpm typecheck
pnpm lint
pnpm format       # check formatting; pnpm format:fix writes it
```

[`CODING_STANDARDS.md`](CODING_STANDARDS.md) covers how code is written here: design, readability, performance, security and tests.

### Trying a change

A plugin or runtime adapter with a `playground/` folder has a real site built on it. Start one with:

```bash
pnpm --filter <package>-playground dev    # e.g. @plumix/plugin-blog-playground
```

A playground serves its package's built output, so rebuild the package after a change (`pnpm exec turbo run build --filter <package>`) and restart it. The apps under `apps/` run the same way.

To try a change in a dependency before its release, point an entry under `overrides` in `pnpm-workspace.yaml` at your local copy, and remove the override before you commit.

## Tests

[`CODING_STANDARDS.md`](CODING_STANDARDS.md#tests) says where a test lives and how to write it. [`docs/agents/testing.md`](docs/agents/testing.md) lists what the shared test helpers provide.

Inside a package:

```bash
pnpm exec vitest run path/to/file.test.ts      # one file
pnpm exec vitest run path/to/file.test.ts -t "name"   # one test
pnpm exec vitest run --coverage                # with coverage
```

A unit test runs in Node (`*.test.ts`) or in a real browser (`*.browser.test.ts`). Reach for an end-to-end test (Playwright, under a package's `e2e/`, run by `pnpm test:e2e`) only when the behaviour needs a running site: a page that loads, a form that posts, an editor a user drives.

### Running the e2e suites

Every suite binds its own ports, so the suites can run in parallel. `@plumix/e2e-ports` reads the ports out of every `playwright.config.ts` and fails `pnpm test:unit` when two suites claim the same one, naming both. A suite never reuses a server that is already listening, because reuse would skip the state wipe, the migrations and the rebuild its `webServer` command does first. A busy port fails loudly instead.

To run the suites from a second checkout, or next to another project holding one of the ports, shift every port a suite owns by the same amount:

```bash
PLUMIX_E2E_PORT_OFFSET=100 pnpm test:e2e
```

### If CI says a committed file is stale

The repo commits some generated files rather than building them, so a pull request diff shows what a change moved. The docs screenshots and the i18n catalogs are two of them. CI regenerates them and fails when the result differs from what you committed. The failing step names the file.

Regenerate it with the script that owns it and commit the result with your change. Commit only what that script produces, never a hand edit or a screenshot taken any other way. A script that needs something extra, like Docker, says so.

## Working on a package

### The admin

`packages/admin` is a prebuilt React app. The plumix Vite plugin copies its `dist/` into `_plumix/admin/` under the site's Vite `publicDir` (`.plumix/public` by default), and `plumix build` carries it into `dist/client/_plumix/admin/`. Every plugin that declares an `adminEntry` compiles into one bundle, `_plumix/admin/plugins/site-bundle.js`.

- `cd apps/demo && pnpm dev` serves the admin at `http://localhost:5173/_plumix/admin/` on the same origin as production. The demo signs you in automatically.
- For hot reload, keep that running and start `cd packages/admin && pnpm dev` too. It serves the admin on `:5174` and proxies `/_plumix/rpc` and `/_plumix/auth` to `:5173`. Set `PLUMIX_BACKEND_URL` to point it at another backend. `pnpm dev` at the root runs both.
- A new route or feature adds a spec under `packages/admin/e2e/`. The suite runs axe-core against WCAG 2.1 AA.

### UI primitives

`packages/admin-ui` owns the components the admin and plugin chunks render ([ADR 0023](docs/adr/0023-admin-ui-owns-the-primitives-it-took-from-shadcn.md)).

- Add one with `pnpm --filter @plumix/admin-ui ui:add <component>`. It runs `shadcn add`, formats the result and regenerates the `exports` map and `src/index.ts` with `roster:sync`. Don't edit those two by hand. A module that must stay out of them goes in the exception table in `scripts/roster.ts`, with its reason.
- A component already in `src/` is Plumix source. Take an upstream change with `pnpm dlx shadcn@latest add <name> --diff` and apply it by hand.
- New CSS variables and keyframes go in `packages/admin/src/styles/globals.css`, which reads this package's source.
- Plugin authors import these components through `plumix/admin/ui`, so a change to a component's markup or props is a breaking change.

### Runtime adapters

Each folder under `packages/runtimes/` runs a Plumix site on one runtime, using that runtime's own primitives ([ADR 0019](docs/adr/0019-a-runtime-adapter-uses-its-runtimes-primitives-and-is-tested-on-that-runtime.md)). The shared suites know no runtime. An adapter tells them how to run it through the `plumix` block in its `package.json`.

- `plumix.scaffold` is what `create-plumix-app` writes into a new project on this runtime: imports, config slots, dependencies, files, and the `packageManager` the project installs with (pnpm by default).
- `plumix.e2e` is what the e2e suites and the scaffold smoke need: `start` serves the built output on `PORT`, `wipe` lists what a run deletes first, `database` says where the database ends up, and `cli` runs the `plumix` CLI (the package's bin by default).
- An adapter proves itself with a `playground/` that runs the shared `runtimeSpec` from `plumix/test/playwright`. The scaffold smoke (`pnpm --filter create-plumix-app smoke:scaffold`) builds a project for each runtime, applies its migrations through `cli`, starts it, and requests `/`, the admin and the `auth/session` RPC.

### Packages that own tables

Core and each plugin that declares tables ships its own migration history in `migrations/` at the package root ([ADR 0027](docs/adr/0027-each-table-owner-ships-its-own-migration-history.md)). After changing a table, run `pnpm --filter <package> db:generate` and commit what it writes. DDL drizzle cannot express, like a trigger or a virtual table, goes in a hand-written migration: `pnpm --filter <package> exec drizzle-kit generate --custom --name <name>`. CI runs `pnpm migrations:check`, which regenerates every package's history and names each one whose `migrations/` changed. The unit-test harness builds its databases from these histories, so a suite runs the migrations a site would.

### The OG card engine

`@plumix/plugin-og` declares its card engine at an exact version, so the copy a site installs is the one the raster suite renders with. `src/takumi.test.ts` fails if the declared and installed versions differ, and a bump goes through that raster suite.

## Pull requests

1. Fork the repo and branch from `main`.
2. Make the change, with tests. A bug fix starts with a test that reproduces the bug.
3. Run the checks listed under "Before committing" in [`AGENTS.md`](AGENTS.md#commands).
4. If a user of a published package would notice the change, add a changeset with `pnpm changeset`. [`AGENTS.md`](AGENTS.md#releases-changesets) says which package to pick and how to word it.
5. Open the pull request. Say what changed and why, and link the issue (`Fixes #123`).

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/), checked by commitlint:

```
feat(core): add hook priority ordering
fix(admin): prevent double-submit on post save
```

Scopes are workspace package names; `pnpm ls -r --depth -1` lists them. Pull requests are squash-merged.

To change the documentation site, edit `apps/docs` and preview it with `pnpm --filter @plumix-apps/docs dev`.

## AI-assisted contributions

AI tools are welcome here; much of Plumix is written with them. Two rules hold for every contribution, however it was made:

- **Never let a model speak for you.** You own every line of the pull request and every reply in its review. Check what the tool claims, adapt it to the repository, and remove anything you cannot justify.
- **Say so.** When a tool wrote a substantial part of a pull request, name it in the description.

Coding agents working in this repo follow [`AGENTS.md`](AGENTS.md) and [`CODING_STANDARDS.md`](CODING_STANDARDS.md).

The agent skills from [mattpocock/skills](https://github.com/mattpocock/skills) are pinned to one commit in [`.sandcastle/mattpocock-skills.ref`](.sandcastle/mattpocock-skills.ref), which Sandcastle and CI install. Run `npm --prefix .sandcastle run skills:sync` to use the same commit locally, and again after the pin moves. To move it, open a pull request that changes the ref, after working through the checklist in that file.

Once a week the [architecture review](.github/workflows/architecture-review.yml) files one report labelled `source:architecture-review`. Nothing acts on it until a maintainer does; the report ends with how to take it forward or decline it.

## Dependencies and third-party code

### Adding a dependency

A dependency used by more than one package goes in the workspace catalog; [`AGENTS.md`](AGENTS.md#dependency-catalog) has the rule.

A bundle Plumix publishes carries license notices for what it includes, and its build fails on a license outside its allowlist. The admin's allowlist is in `packages/admin/vite.config.ts`. Add a permissive license's SPDX id to it, and for a copyleft license pick a different package. The notice generator can't see a dependency that reaches `dist` only as CSS or a font, so list those by hand in the same file.

### Copying third-party source

Reimplementing an approach you read about owes nothing. Name the project in a comment where it helps the next reader (see "Prior art" in `LICENSE`).

Copying code is different. If the upstream file was open while you wrote it, add an entry to the "Third-party code and assets" section of [`LICENSE`](LICENSE) with the copyright line and license read from the upstream's own repository, never from memory. Name the upstream in the source file, but leave the license to `LICENSE`. Nobody corrects a license string copied into a comment.

## How the repo checks itself

Reference for when a check surprises you.

### What CI re-runs

Turborepo skips a task when nothing it reads has changed, so most pull requests run a small part of the pipeline. Three rules decide what you will see:

- **Test files are not build inputs.** `turbo.json` excludes tests, `e2e/` and `screenshots/` from the `build` and `topo` tasks, because every `tsconfig.build.json` already excludes them. Editing a test re-runs that package's own lint, typecheck and unit tests, not every dependent's.
- **Editing upstream source re-runs dependents' unit tests.** The suites resolve workspace imports to source, so a package's source is part of what its dependents' tests execute; `test:unit` depends on `^topo` to say so. Without that edge, turbo served a cached pass for the very change that broke a test (#2093).
- **Everything is cached, including e2e.** Turbo skips a suite when the packages it exercises are untouched, so a change to `@plumix/core`, which everything depends on, runs them all.

To see a task run that turbo wants to skip, pass `--force`. The scaffolder smoke job opts out of both caches on purpose. It asks whether _this commit_ breaks a generated project, so it can't trust a replayed artifact.

### Link validation

The `Links` CI job checks every local link offline with [lychee](https://lychee.cli.rs), `#anchor` fragments included. Repository prose links are ordinary relative paths. Docs pages under `apps/docs/src/content/docs` link to Starlight routes (`/fields/text/#reserved-names`), which the job reads as the `.mdx` file at that path, so a page must not set its own `slug`. For the form a docs link takes, see [`apps/docs/README.md`](apps/docs/README.md).

The weekly `Link Check` workflow checks remote URLs, including prose links to `https://docs.plumix.dev/...`.

## License

By contributing, you agree to license your contributions under the [MIT License](LICENSE).
