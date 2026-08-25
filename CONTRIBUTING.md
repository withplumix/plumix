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
collide. Those are base values: set `PLUMIX_E2E_PORT_OFFSET` to shift every
port a suite owns — HTTP, workerd inspector, and readiness — by the same
amount, which is how you run the suites from a second checkout or alongside
another project holding one of the default ports.

```bash
PLUMIX_E2E_PORT_OFFSET=100 pnpm test:e2e
```

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
on the step *Assert the committed images are the ones the capture produces* if
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
