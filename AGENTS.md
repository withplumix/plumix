# AGENTS.md

Agent-facing conventions for the Plumix repo.

## What this is

CMS inspired by WordPress, with pluggable runtime adapters. Cloudflare (`@plumix/runtime-cloudflare`, using D1/KV/R2) is the only runtime shipped today; more are planned. Pre-1.0: every `0.x` minor may break.

Current target is Cloudflare Workers, so runtime code must stay Worker-compatible — no Node built-ins, no `fs`, no dynamic require.

## Commands

Turborepo drives everything from the root:

- `pnpm build` — every package in topological order
- `pnpm typecheck` / `pnpm lint` / `pnpm format` — turbo tasks; `lint` and `typecheck` `dependsOn: ^build` so they need built upstream deps
- `pnpm test` — vitest across every package that defines tests
- `pnpm test:e2e` — Playwright e2e (only the packages that opt in)
- `pnpm knip` — unused-export and dependency check
- `pnpm boundaries` — dependency-cruiser; enforces the umbrella-vs-internals rule (see Architecture)
- `pnpm commitlint` — conventional-commit lint

**Single-package commands.** Use turbo, not pnpm, for any task with `dependsOn` set (`build`, `lint`, `typecheck`, `test`, `test:e2e`, `publint`, `attw`):

```bash
pnpm exec turbo run test --filter @plumix/core
```

Bare `pnpm --filter @plumix/core test` works locally with a warm tree but fails cold in CI because upstream `build` won't have run.

**Single test file.** Inside a package: `pnpm exec vitest run path/to/file.test.ts`. With coverage: `pnpm exec vitest run --coverage`.

## Architecture

### Workspaces

```
packages/
├── core/                @plumix/core              — engine: schema, auth, hooks, RPC, route, plugin manifest
├── admin/               @plumix/admin             — React SPA (Vite + Tanstack Router/Query); shadcn-based UI
├── blocks/              @plumix/blocks            — block primitives (currently `export {}`; design intent)
├── plumix/              plumix                    — public umbrella; subpath exports re-export internals
├── create-plumix-app/                             — scaffolder
├── plugins/
│   ├── audit-log/ blog/ media/ menu/ pages/       — first-party plugins
└── runtimes/
    └── cloudflare/      @plumix/runtime-cloudflare — Cloudflare D1/R2/KV bindings
examples/{blog,minimal}                            — playgrounds + e2e fixtures
tooling/{eslint,prettier,typescript,vitest}        — shared configs as workspace packages
```

### The umbrella rule

The `plumix` package re-exports the public API surface from internal `@plumix/{core,admin,blocks}` under subpaths (`plumix`, `plumix/vite`, `plumix/admin`, `plumix/admin/react`, `plumix/theme`, `plumix/plugin`, …).

**Consumer packages — plugins, runtimes, examples, `create-plumix-app` — must import from `plumix` (or its subpaths). They must not import from `@plumix/core`, `@plumix/admin`, or `@plumix/blocks` directly.**

This is the boundary that lets internal packages refactor freely while the published surface stays stable. Violations are caught by `pnpm boundaries` (config in `.dependency-cruiser.cjs`).

### Plugin model

A plugin is a function returning a `PluginManifest` (defined in `@plumix/core`, exposed publicly as `plumix/plugin` and `plumix/manifest`). The manifest declares the plugin's schema (drizzle tables), routes, RPC procedures, admin routes/components, hooks, and capabilities. First-party plugins under `packages/plugins/*` are the canonical examples.

### Dependency catalog

`pnpm-workspace.yaml` defines a `catalog:` for deps used by multiple packages (drizzle, react, vite, vitest, etc.). A dep used by exactly one package goes direct in that package's `package.json`, **not** in the catalog — the catalog is for de-duplication, not centralization.

## Tests

One vitest suite per package. Two layouts, in order of preference:

1. **Colocate** — `src/foo.test.ts` next to `src/foo.ts`. Default for everything, including tests that use in-memory DBs or the harnesses from `@plumix/core/test` (they run inside the vitest worker).
2. **Package-level `test/`** — only when colocation can't work: tests that spawn a real binary, run against built `dist/`, or exercise the package as an external consumer.

E2E (Playwright) is separate, lives under each package's `e2e/`, runs via `pnpm test:e2e`.

### Selectors

Tests use `getByTestId` only — never `getByRole`, `getByText`, or `getByLabel`.

### Coverage

Wired in every test-having package (`pnpm exec vitest run --coverage`). Tracked, not enforced; no thresholds.

### shadcn

`packages/admin/src/components/ui/*` is vendored from shadcn. Wrap or extend — never edit in place.

## Commits, branches, PRs

- Conventional Commits enforced by commitlint (`@commitlint/config-conventional` + `config-pnpm-scopes`).
- **Scopes** are validated against workspace package names — run `pnpm ls -r --depth -1` to list them. For `.github/` meta changes, use `ci:` with no scope.
- Use `refactor`, not `ref` — `ref` isn't in the allowed type-enum.
- **Subject must start lowercase.** Rephrase to start with a lowercase verb if you'd otherwise lead with `CI`, `API`, `OAuth`, etc.
- **Wrap commit body lines at ≤100 chars** — footer-max-line-length inherits from config-conventional even though body-max-line-length is disabled.
- Never put "claude" in a branch name or commit message.
- All PRs are squash-merged.

## Agent skills

### Issue tracker

GitHub Issues at `withplumix/plumix`, operated via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`); will be created on first use. See `docs/agents/triage-labels.md`.

### Domain docs

Multi-context: `CONTEXT-MAP.md` at the root points at per-package `CONTEXT.md` files under `packages/<pkg>/`. See `docs/agents/domain.md`.
