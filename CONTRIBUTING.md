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
pnpm test         # Run vitest across every package that defines tests
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

End-to-end tests (Playwright) are not part of this taxonomy and will land
later as a separate `test:e2e` script in the packages that need them
(`packages/admin`, `examples/*`).

Every test-having package ships a `vitest.config.ts` with coverage wired
(`pnpm exec vitest run --coverage` inside the package). Thresholds are not
enforced yet.

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
