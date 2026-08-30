# Contributing to Plumix

Thanks for your interest in contributing! This guide will help you get started.

## Prerequisites

- **[nvm](https://github.com/nvm-sh/nvm)** (recommended) or [fnm](https://github.com/Schniz/fnm) — for managing Node.js versions
- **[Corepack](https://nodejs.org/api/corepack.html)** — ships with Node.js, manages pnpm version automatically

## Setup

```bash
git clone git@github.com:withplumix/plumix.git
cd plumix
nvm install        # installs Node version from .nvmrc
nvm use            # activates it
corepack enable    # enables pnpm via Corepack
pnpm install       # installs dependencies
```

> **Tip:** add `nvm use` to your shell's `cd` hook so it auto-switches when you enter the project. See [nvm docs — deeper shell integration](https://github.com/nvm-sh/nvm#deeper-shell-integration).

To improve `git blame`, run this once after cloning:

```bash
git config --local blame.ignoreRevsFile .git-blame-ignore-revs
```

To automatically handle merge conflicts in `pnpm-lock.yaml`:

```bash
pnpm add -g @pnpm/merge-driver
pnpm dlx npm-merge-driver install --driver-name pnpm-merge-driver --driver "pnpm-merge-driver %A %O %B %P" --files pnpm-lock.yaml
```

## Development

```bash
pnpm build        # Build all packages
pnpm typecheck    # Type-check all packages
pnpm lint         # Lint all packages
pnpm knip         # Check for unused exports/deps
pnpm format       # Check formatting
pnpm test         # vitest (test:unit + test:build) across packages
```

## Tests

Plumix has one vitest suite per package. Where the file lives depends on
what the test needs:

- **Colocate next to the source you're testing** (`src/**/*.test.ts`). This
  is the default — if you're testing a function, put the test alongside it.
  Using an in-memory database or the test harnesses from `@plumix/core/test`
  still counts as colocated: they run inside the vitest worker.
- **Use the package-level `test/` directory** only when colocation doesn't
  work — for example, tests that spawn a real binary, run against the
  built `dist/`, or exercise the package as an external consumer would.

End-to-end tests (Playwright) are not part of this taxonomy. They live behind
a `test:e2e` script in the packages that have them (`packages/admin`,
`packages/admin-editor`, each `packages/plugins/*`, and `apps/demo`), and share
one config helper, `definePlumixE2EConfig`.

Each suite binds a distinct port so a parallel `turbo run test:e2e` doesn't
collide: the plugin playgrounds and `apps/demo` take HTTP `30N0` with the
matching workerd inspector port `93N0`, and the two admin suites preview on
`5180`/`5181`. Those are base values: set `PLUMIX_E2E_PORT_OFFSET` to shift
every port a suite owns — HTTP, workerd inspector, and readiness — by the same
amount, which is how you run the suites from a second checkout or alongside
another project holding one of the default ports.

```bash
PLUMIX_E2E_PORT_OFFSET=100 pnpm test:e2e
```

Two suites on one base port only fails under CI's parallel run, and it fails in
the suite that _lost_ the port rather than the one that took it — so
`@plumix/e2e-ports` reads the ports out of every `playwright.config.ts` and
fails `pnpm test:unit` on a duplicate, naming both packages.

The suites never reuse a server that is already listening. Playwright does not
check that the responder is this suite's build, and reuse would skip the setup
each `webServer` command does first — the `.wrangler/state` wipe, the
migrations, the rebuild — so a reused server means testing stale data against a
stale build. A busy port fails loudly instead; move the block with the offset.

`packages/admin` carries a second Playwright project on the same config — the
documentation captures, run by `pnpm docs:screenshots`. It binds admin's e2e
port, so it collides with a running admin suite or preview the same way any two
suites would, and the offset above is the escape hatch for that too — it shifts
`:5190`, where the capture publishes its containerised browser, along with the
rest.

Every test-having package ships a `vitest.config.ts` with coverage wired
(`pnpm exec vitest run --coverage` inside the package). Thresholds are not
enforced yet.

### If CI says the committed screenshots are stale

`apps/docs` publishes screenshots of the admin, and they are committed rather
than built, so that a pull request diff shows which visuals a change moved. CI
keeps that promise honest: it re-renders them and fails the **Test (e2e)** job
on the step _Assert the committed images are the ones the capture produces_ if
what it rendered is not what you committed.

That step failing means your change moved something the images show. Regenerate
them and commit the result alongside it:

```bash
pnpm docs:screenshots   # needs a running Docker; the capture renders in a container
git add apps/docs/src/assets/screenshots
```

Two things make this cheaper than it sounds:

- **The rendering is not your machine's.** It happens in a pinned Playwright
  container, so the bytes you commit are the bytes CI renders. You are not
  chasing a diff that only exists because you are on macOS and CI is on Linux.
- **It only runs when it could matter.** The capture is a turbo task keyed on
  the admin package and everything it is built from, so a change that cannot
  move a pixel takes a cache hit and the step passes without rendering at all.

[`packages/admin/README.md`](packages/admin/README.md) has the rest — what a
subject is, how to add one, and why the container is pinned the way it is.

### The pinned OG card renderer

`@plumix/plugin-og` declares its card engine at an exact version, because the
lockfile governs this repo only and a range would let a site install a release
the raster suite never rendered with. `src/takumi.test.ts` holds that shut: the
declared spec must equal the installed engine version, so the pin cannot
quietly become a range again.

Bumping it is a deliberate edit. The raster suite is what decides: it loads the
real wasm, so a release that breaks the narrow surface `takumi.ts` uses fails
here rather than on a site.

## Link validation

Links mean two different things in this repo, so two gates check them; every
file belongs to one or the other.

**Repository prose** — everything outside `apps/docs/src/content/docs`:
`README.md`, `CONTRIBUTING.md`, `AGENTS.md`, `docs/**`, the changelogs, the
package READMEs. Links here resolve against the file tree, the way GitHub
renders them, so they are ordinary relative paths. The `Links` CI job checks
them offline with [lychee](https://lychee.cli.rs), including `#anchor`
fragments.

**Published docs pages** — the content collection under
`apps/docs/src/content/docs`. Links here resolve against Starlight's routing
table, not the file tree: `/fields/` is a route built from collection slugs and
`_meta.yml`, and no such directory exists on disk.
`starlight-links-validator` runs inside `astro build` and checks them, anchors
included; the `Docs (build)` CI job is where that fails. For the form a link
in a docs page takes, see [`apps/docs/README.md`](apps/docs/README.md).

Pointing lychee at the docs tree would report every correct cross-reference as
broken, which is why the two never overlap — `lychee.toml` excludes that tree
by path. The one job that spans both is the weekly `Link Check` workflow: a
remote URL is remote wherever it is written, so that job reads `.md` and `.mdx`
alike and restricts itself to `http(s)`.

Two things sit outside both gates, deliberately. A page marked `draft: true` is
skipped by the docs validator, so its links go unchecked until it is published.
And a link from repository prose to a `https://docs.plumix.dev/...` route is
remote to lychee, so it is checked weekly rather than on the PR that writes it.

`lychee.toml` is the only exclude list; the docs-side validator carries no host
policy of its own.

## What CI re-runs

Turborepo skips a task when nothing it reads has changed, so most pull
requests execute a small fraction of the pipeline. Three rules decide what you
will see:

- **Test files are not build inputs.** `turbo.json` excludes `*.test.ts`,
  `*.spec.ts`, `e2e/` and `screenshots/` from the `build` and `topo` tasks,
  because every `tsconfig.build.json` already excludes them. Editing a test in
  `@plumix/core` therefore re-runs that package's own lint, typecheck and unit
  tests — not every dependent's.
- **Editing upstream source does re-run dependents' unit tests.** The suites
  resolve workspace imports to source, so `@plumix/core`'s source is part of
  what a plugin's tests execute — `test:unit` depends on `^topo` to say so.
  Expect a core source change to re-run around fifteen of the twenty suites.
  Without that edge a package's hash covered only its own files, and turbo
  served a cached pass for the very change that broke the test (#2093).
- **Everything is cached, including e2e.** A suite is skipped when the packages
  it exercises are untouched. A change to `@plumix/core` still runs all nine
  e2e suites, because everything depends on it.

If you need to see a task run that turbo wants to skip, pass `--force`.

The scaffolder smoke job deliberately opts out of both caches: it packs what it
builds to ask whether _this commit_ breaks a generated project, so a replayed
artifact is the one thing it must not trust.

## Making changes

### Commit messages

We use [Conventional Commits](https://www.conventionalcommits.org/) enforced by commitlint in CI:

```
feat(core): add hook priority ordering
fix(admin): prevent double-submit on post save
chore(ci): update setup action
```

Scopes are validated against workspace package names. Run `pnpm ls -r --depth -1` to see available scopes.

### Pull requests

1. Fork and create your branch from `main`
2. Run `pnpm build && pnpm typecheck && pnpm lint` locally
3. Open a PR — all PRs are squash-merged

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).

### Adding a dependency

The admin build generates notices for what it bundles and fails if a dependency
is not permissively licensed. If it fails on a license that is permissive but
unlisted, add its SPDX id to the allowlist in `packages/admin/vite.config.ts`.
If it fails on a copyleft one, pick a different package.

A dependency whose code reaches `dist` as CSS or a font is invisible to that
generator and needs adding to `shipAssetLicenses` in the same file.

### Copying third-party source

Reimplementing an approach you read about owes nothing — name the project in a
comment where it helps the next reader (see "Prior art" in `LICENSE`).

Copying code is different. If the upstream file was open while you wrote it,
add an entry to the "Third-party code and assets" section of [`LICENSE`](LICENSE)
with the copyright line and license read from the upstream's own repository —
never from memory. Name the upstream in the source file, but leave the license
to `LICENSE` — a license string duplicated into a comment is one nobody
corrects.
