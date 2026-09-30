# AGENTS.md

Plumix is a CMS with pluggable runtime adapters. It is pre-1.0, so every `0.x` minor may break.

## Working rules

- **TDD.** A bug isn't fixed until a failing test reproduces it first. New behavior starts red, one RED→GREEN cycle at a time, never all the tests first and then all the code.
- **Stay in scope.** One PR per issue, and every changed line traces to it. Skip drive-by refactors and bulk cleanups. Match the surrounding style, remove only what your change left unused, and mention dead code you find rather than deleting it. Ship dependent PRs one at a time. Merge one and rebase before you start the next.
- **Investigate before building.** When a change is consumed in more than one place (server, admin, editor, a second bundle), find out how each consumer gets it today before you design. Say what you verified and where you stopped. Resolving a path is not a working render.
- **Claims need evidence.** Back every statement about how the code behaves with a file and line, a source excerpt, or a command someone can rerun. That goes for PR bodies, review replies and declines alike.
- **Read the package's notes first.** Before editing a package, read its section under "Working on a package" in `CONTRIBUTING.md`, and every `README.md` from the repo root to the file's folder. Apps and tooling keep their local procedures in their READMEs.
- **No safety nets unasked.** No dev warnings, extra validation layers or override APIs the ticket did not ask for.
- **Stop rather than work around.** When a test passes only with another flag, counter or copy of state, stop and consolidate who owns that state. Never get past a blocker by deleting a lockfile, `--force`, `--ignore-scripts` or disabling a check; stop and say what blocks you.
- **A failing check is yours until shown otherwise.** Call a failure pre-existing only after reproducing it on `main`, and give that evidence.
- **Leave changes you did not make.** Never revert or rewrite someone else's edits in a shared worktree, stash or branch.
- **Regenerate, don't hand-edit.** Change a generated file only by running the script that owns it, and commit the result. Hand-authored catalogs are the exception, and they say so.
- **Keep docs true in the same change.** When a change makes a README, an ADR, this file or `CODING_STANDARDS.md` wrong, fix it in the same PR.

## Coding standards

[`CODING_STANDARDS.md`](./CODING_STANDARDS.md) is how code in Plumix is written. Read it before writing or reviewing code.

## Commands

Run everything from the root. Most root scripts run the turbo task of the same name across the workspace.

| Script                            | What it does                                                                                                        |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `build`                           | Build every package in dependency order.                                                                            |
| `dev`                             | `turbo watch dev` across the workspace.                                                                             |
| `typecheck` / `lint` / `lint:fix` | Type-check and lint. Both need upstream packages built (see below).                                                 |
| `format` / `format:fix`           | Prettier: `format` checks, `format:fix` writes.                                                                     |
| `test:unit`                       | Vitest in every package. It reads workspace packages from source and stubs the i18n catalogs, so it needs no build. |
| `test:build`                      | The `*.build.test.ts` suites, which inspect what the build produced.                                                |
| `test`                            | `test:unit` + `test:build`.                                                                                         |
| `test:e2e`                        | Playwright, in the packages that have an `e2e/` suite.                                                              |
| `docs:screenshots`                | Recapture the docs screenshots (needs Docker; see `CONTRIBUTING.md`).                                               |
| `i18n:check`                      | Fails when `<Trans>`/`defineMessage` strings change without `lingui extract`.                                       |
| `i18n:ratchet:check`              | Fails when a file on the admin's unlocalized-strings denylist no longer needs to be on it.                          |
| `knip`                            | Unused files, exports and dependencies.                                                                             |
| `publint` / `attw`                | Check each published package's `package.json` and its types as consumers resolve them.                              |
| `commitlint`                      | Lint commit messages.                                                                                               |
| `check-no-major`                  | Fails when a changeset would take a package to 1.0.                                                                 |
| `smoke`                           | Publish to a throwaway registry, scaffold an app from it, and boot it.                                              |
| `clean` / `clean:workspaces`      | Remove the root `node_modules` / each package's `dist`, caches and `node_modules`.                                  |
| `release` / `version-packages`    | Changesets publishing; the release bot runs these.                                                                  |

**i18n drift.** Fix an `i18n:check` failure with `pnpm --filter <pkg> i18n:extract` then `i18n:compile`, and commit the `locales/` churn. A package whose `i18n:extract` refuses to run hand-authors its `locales/*.po` (its strings live in a server-side plugin definition, which no Babel macro pass reads); fix its drift by editing `locales/en.po`.

**Runtime versions.** A runtime adapter's suites run on that runtime ([ADR 0019](docs/adr/0019-a-runtime-adapter-uses-its-runtimes-primitives-and-is-tested-on-that-runtime.md)). Install each runtime at the version its pin file at the repo root names (`.nvmrc`, `.<runtime>-version`).

**A check covers only what it reads.** `test:unit` reads source; `typecheck`, `test:build`, e2e and anything served from a build read `dist/`. A green check on one side says nothing about the other, so rebuild before trusting a check that reads `dist/`.

**Why typecheck needs a build.** Every published package's `exports` points `types` at `dist/`, so a package type-checks only once the packages it imports are built. Turbo builds them first (`typecheck` and `lint` depend on `^build` in `turbo.json`, plus the package's own `i18n:compile`); `pnpm --filter` runs the script alone, so it passes only when a `dist/` is already lying around. For one package, use turbo:

```bash
pnpm exec turbo run typecheck --filter @plumix/core
```

The same holds for every task with a `dependsOn`. `test:unit` has none, so `pnpm --filter` works for it.

**Single test file.** Inside a package: `pnpm exec vitest run path/to/file.test.ts`. With coverage: `pnpm exec vitest run --coverage`.

**Browser tier.** Run `pnpm --filter @plumix/admin exec playwright install chromium` once before the first `pnpm test:unit`; `*.browser.test.*` files run in headless Chromium.

**Tests.** What the shared test helpers provide, and how to diagnose a slow test before reaching for a timeout, are in [`docs/agents/testing.md`](docs/agents/testing.md).

**Before committing.** `pnpm typecheck && pnpm lint && pnpm format && pnpm knip && pnpm test` must be clean, and add a changeset if the change is consumer-visible (see [Releases](#releases-changesets)). CI reruns these plus e2e, i18n, publint, and attw.

## Architecture

### Workspaces

- `packages/` holds everything published. The framework is `plumix` (the public umbrella) plus the
  internal `@plumix/*` packages it re-exports; they are the `fixed` group in
  `.changeset/config.json`. Around it: `create-plumix-app`, one plugin per folder under `plugins/`,
  one runtime adapter per folder under `runtimes/`.
- `apps/` holds private sites built on Plumix.
- `tooling/` holds private workspace packages that configure or guard the repo itself.

Each package's `package.json` `description` says what it is.

### The umbrella rule

Every package outside the framework imports Plumix only through `plumix` and its subpaths (the
`exports` of `packages/plumix/package.json`), never through an internal `@plumix/*` package. That
boundary lets the internal packages refactor freely while the published surface stays stable. The
`noInternalImports` ESLint config in `@plumix/eslint-config` catches it in the packages that opt in.

`tooling/published-surface` records a reason for every export a consumer can import. A PR that adds
an export adds its row there.

### Runtimes

Code on the request path in core and the plugins runs on every runtime, so it uses only APIs they all provide. Code that needs one runtime's primitives belongs in that runtime's adapter ([ADR 0019](docs/adr/0019-a-runtime-adapter-uses-its-runtimes-primitives-and-is-tested-on-that-runtime.md)).

A change to the contract the adapters implement lands in every adapter in the same PR, or the PR says why an adapter is left out. Working through one runtime is not done.

### Core's layers

`@plumix/core` is one package arranged in layers that import only downward
([ADR 0010](docs/adr/0010-core-is-one-package-of-enforced-layers.md) has the layers and the rules).
When new code needs something from a higher layer, move the contract down. Don't point the import
up, and don't split a layer into its own package before the trigger the ADR names.

### Plugin model

A plugin is a descriptor built with `definePlugin` from `plumix/plugin`, or a factory taking
options that returns one. The descriptor declares everything the plugin contributes. The
first-party plugins under `packages/plugins/` are the canonical examples.

### Dependency catalog

A dependency used by more than one package goes in the `catalog:` in `pnpm-workspace.yaml`; one
used by a single package goes direct in that package's `package.json`. The catalog is for
de-duplication, not centralization. Version families that release in lockstep share a **named
catalog** under `catalogs:`, so a bump is a single-line change.

### Env & secrets

Gate dev-only code on `import.meta.env.DEV`, a compile-time constant, not on `process.env`, so a dev endpoint fails closed in production. A secret config slot takes an `EnvInput<T>`, and `resolveEnvInput` reads it. Local secrets live in `.env` (gitignored) on every runtime, and a variable set in the environment wins over it. Never paste secret values into commits, logs, or chat.

## Commits, branches, PRs

- Conventional Commits, enforced by commitlint (`commitlint.config.ts`).
- **Scopes** must be workspace package names, and `pnpm ls -r --depth -1` lists them. For `.github/` meta changes, use `ci:` with no scope.
- Use `refactor`, not `ref`. Commitlint rejects `ref`.
- **Subject must start lowercase.** Rephrase to start with a lowercase verb if you'd otherwise lead with `CI`, `API`, `OAuth`, etc.
- **Wrap commit body lines at 100 characters.** `commitlint.config.ts` turns the body limit off, but config-conventional's 100-character footer limit still applies.
- Branch names are `<type>/<short-desc>`. Never "claude" in a branch name or PR title. Commit and PR bodies carry the `Co-Authored-By` trailer.
- Write `Fixes #N` only after `gh issue view N` shows a title that matches the work. A branch or worktree name is not a source for N. Use `Refs #N` when the issue stays open.
- All PRs are squash-merged.

## Releases (changesets)

Changesets publishes the packages (`.changeset/README.md`). Merging a PR that contains changesets makes the bot open a **"Version Packages"** PR. Merging _that_ one publishes to npm, signed with provenance, once a boot test against a local Verdaccio registry passes.

**Write a changeset** when your PR changes anything a _consumer_ of a published package would notice, such as a feature, a fix, or a change to behavior, API, exports or dependencies:

```bash
pnpm changeset   # pick the bump, write a one-line user-facing summary, commit the generated file
```

**Skip it** when a consumer would see no difference (tests, CI, docs, internal refactors, chores), or when the change touches only private packages.

**Which package to select, and the bump:**

- **Framework.** The packages in the `fixed` group in `.changeset/config.json` bump together. Select any one and they all move to the same version.
- **Everything else** versions **independently**; select the specific package (a plugin fix ships with no framework release).
- Pre-1.0 (`0.x`): **patch** = fix, **minor** = feature _or_ breaking change.

Write the summary as a release note, not a commit message. Start with a present-tense verb (Adds, Fixes, Removes) and describe what a user will notice.

## Agent skills

### Issue tracker

GitHub Issues at `withplumix/plumix`, operated via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The label for each triage role is in `docs/agents/triage-labels.md`.

### Domain docs

One root `CONTEXT.md`, split by subheading, holds the domain vocabulary, and `docs/adr/` holds repo-wide decisions. There is no `CONTEXT-MAP.md` and no per-package glossary. ADR 0001 rejected both, because the vocabulary means the same thing in every package. See `docs/agents/domain.md`.
