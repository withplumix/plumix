# AGENTS.md

Agent-facing conventions for the Plumix repo.

## What this is

CMS inspired by WordPress, with pluggable runtime adapters. Cloudflare (`@plumix/runtime-cloudflare`, using D1/KV/R2) is the only runtime shipped today; more are planned. Pre-1.0: every `0.x` minor may break.

Current target is Cloudflare Workers, so runtime code must stay Worker-compatible — no Node built-ins, no `fs`, no dynamic require.

## Working rules

- **TDD.** A bug isn't fixed until a failing test reproduces it first. New behavior starts red — one RED→GREEN cycle at a time, never all-tests-then-all-impl.
- **Stay in scope.** One PR per issue; no drive-by refactors, bulk cleanups, or unrelated edits. Serialize dependent PRs — ship, merge, rebase, then start the next.
- **Localize user-facing strings.** Everything a user reads — JSX text, `aria`/`title`/`alt`, toasts, block metadata — goes through Lingui descriptors (`useLabel`), never hardcoded English.

## Commands

Turborepo drives everything from the root:

- `pnpm build` — every package in topological order
- `pnpm typecheck` / `pnpm lint` / `pnpm format` — turbo tasks; `lint` and `typecheck` `dependsOn: ^build` so they need built upstream deps
- `pnpm test:unit` — low-level vitest across every package; workspace imports resolve to source and i18n catalogs are stubbed, so it needs no build or `i18n:compile`
- `pnpm test:build` — vitest suites that spin up a real Vite build and inspect the emitted artifacts (`*.build.test.ts`; only plumix has these)
- `pnpm test:e2e` — Playwright e2e (only the packages that opt in)
- `pnpm test` — convenience umbrella for `test:unit` + `test:build`
- `pnpm knip` — unused-export and dependency check
- `pnpm i18n:check` — source↔catalog drift gate; fails when `<Trans>`/`defineMessage` strings change without `lingui extract` (run `pnpm --filter <pkg> i18n:extract` + `i18n:compile`, commit the `locales/` churn)
- `pnpm commitlint` — conventional-commit lint

**Single-package commands.** Use turbo, not pnpm, for any task with `dependsOn` set (`build`, `lint`, `typecheck`, `test:build`, `test:e2e`, `publint`, `attw`):

```bash
pnpm exec turbo run typecheck --filter @plumix/core
```

Bare `pnpm --filter @plumix/core typecheck` works locally with a warm tree but fails cold in CI because upstream `build` won't have run. `test:unit` is the exception — it has no `dependsOn` (source-resolved, nothing generated), so pnpm or turbo both work.

**Single test file.** Inside a package: `pnpm exec vitest run path/to/file.test.ts`. With coverage: `pnpm exec vitest run --coverage`.

**Before committing.** `pnpm typecheck && pnpm lint && pnpm format && pnpm test` must be clean (`format` checks; `format:fix` writes), and add a changeset if the change is consumer-visible (see [Releases](#releases-changesets)). CI reruns these plus e2e, knip, i18n, publint, and attw.

## Architecture

### Workspaces

```
packages/
├── core/                @plumix/core              — engine: schema, auth, hooks, RPC, route, plugin manifest
├── admin/               @plumix/admin             — React SPA (Vite + Tanstack Router/Query); shadcn-based UI
├── blocks/              @plumix/blocks            — block primitives + renderer
├── plumix/              plumix                    — public umbrella; subpath exports re-export internals
├── create-plumix-app/                             — scaffolder
├── plugins/
│   ├── audit-log/ blog/ comments/ media/ menu/ pages/ — first-party plugins
└── runtimes/
    └── cloudflare/      @plumix/runtime-cloudflare — Cloudflare D1/R2/KV bindings
examples/{blog,minimal}                            — playgrounds + e2e fixtures
tooling/{eslint,lingui,prettier,typescript,vitest} — shared configs as workspace packages
```

### The umbrella rule

The `plumix` package re-exports the public API surface from the internal `@plumix/{core,blocks,admin,admin-editor,admin-ui}` packages under subpaths (`plumix`, `plumix/vite`, `plumix/admin`, `plumix/admin/react`, `plumix/admin/ui`, `plumix/theme`, `plumix/plugin`, …).

**Consumer packages — plugins, runtimes, examples, `create-plumix-app` — must import from `plumix` (or its subpaths). They must not import from the internal packages (`@plumix/core`, `@plumix/blocks`, `@plumix/admin`, `@plumix/admin-editor`, `@plumix/admin-ui`) directly.**

This is the boundary that lets internal packages refactor freely while the published surface stays stable. Violations are caught by ESLint's `no-restricted-imports` rule via the `noInternalImports` config in `@plumix/eslint-config`, which consumer packages opt into.

### Plugin model

A plugin is a descriptor built with `definePlugin` (from `plumix/plugin`); options-taking plugins export a factory returning one instead — `menu({ locations })`, `media(...)`, `auditLog(...)`. The descriptor declares the plugin's schema (drizzle tables), routes, RPC procedures, admin routes/components, hooks, and capabilities. First-party plugins under `packages/plugins/*` are the canonical examples.

### Dependency catalog

`pnpm-workspace.yaml` defines a `catalog:` for deps used by multiple packages (drizzle, react, vite, vitest, etc.). A dep used by exactly one package goes direct in that package's `package.json`, **not** in the catalog — the catalog is for de-duplication, not centralization.

Version families that release in lockstep get a **named catalog** under `catalogs:` (`catalogs.tailwind`, `catalogs.lingui`) and are consumed as `"catalog:tailwind"` / `"catalog:lingui"` — a bump is then a single-line change.

### Env & secrets

Gate dev-only code on `import.meta.env.DEV` (a compile-time constant), not `process.env` — a dev endpoint must fail closed in production. Secret config slots take an `EnvInput<T>` resolved with `resolveEnvInput`; local Worker secrets live in `.dev.vars` (gitignored). Never paste secret values into commits, logs, or chat.

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

## Releases (changesets)

Publishing is automated by Changesets (`.changeset/README.md`). Merging a PR that contains changesets makes the bot open a **"Version Packages"** PR; merging _that_ publishes to npm (signed with provenance, behind a Verdaccio boot-smoke gate).

**Write a changeset** when your PR changes anything a _consumer_ of a published package would notice — a feature, a fix, or a behavior / API / exports / dependency change:

```bash
pnpm changeset   # pick the bump, write a one-line user-facing summary, commit the generated file
```

**Skip it** when the change has no consumer-visible effect — tests, CI, docs, internal refactors, chores — or touches only private packages (`examples/*`, `tooling/*`, `packages/plugins/*/playground`).

**Which package to select, and the bump:**

- **Framework** — `plumix`, `create-plumix-app`, and the internal `@plumix/{core,blocks,admin,admin-editor,admin-ui}` are a `fixed` group: select any one and they all bump together to the same version.
- **Plugins and the runtime adapter** — `@plumix/plugin-*` and `@plumix/runtime-cloudflare` version **independently**; select the specific package (a plugin fix ships with no framework release).
- Pre-1.0 (`0.x`): **patch** = fix, **minor** = feature _or_ breaking change.

Write the summary as upgrade release-notes, not a commit message: lead with a present-tense verb (Adds / Fixes / Removes) and describe the observable effect.

## Agent skills

### Issue tracker

GitHub Issues at `withplumix/plumix`, operated via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`); will be created on first use. See `docs/agents/triage-labels.md`.

### Domain docs

Multi-context: `CONTEXT-MAP.md` at the root points at per-package `CONTEXT.md` files under `packages/<pkg>/`. See `docs/agents/domain.md`.
