# @plumix/admin

Pre-built React SPA published as its own package and depended on by
[`plumix`](../plumix). The admin compiles once into `dist/`, and the plumix
Vite plugin resolves this package from `node_modules` and stages it into the
consumer's `.plumix/public/_plumix/admin/` directory so the active runtime
adapter serves it at `/_plumix/admin/*` with no per-consumer rebuild.

## Dev workflows

Two supported loops, pick whichever matches what you're iterating on.

### Consumer-style: `plumix dev` only (single origin)

Once the consumer has wired static-asset serving for their chosen runtime
(the demo app's config shows the right binding for that runtime),
running the backend serves admin too — no second process:

```bash
cd apps/demo
pnpm dev                              # :5173
# open http://localhost:5173/_plumix/admin/
```

`apps/demo` runs in demo mode: the synthetic authenticator auto-logs you in
as admin, so there's no sign-in step while iterating.

This mode exercises the same serving path production uses (the runtime's
asset layer in front of the request handler). Best for "does my feature
work end-to-end?" checks.

### Admin-authoring: `pnpm dev` in both workspaces (two ports, HMR)

When iterating on admin source, Vite's HMR against admin source files is
faster than rebuilding + restaging. Two terminals:

```bash
# terminal 1 — backend
cd apps/demo && pnpm dev              # :5173

# terminal 2 — admin with HMR
cd packages/admin && pnpm dev         # :5174
# open http://localhost:5174/_plumix/admin/
```

Admin's Vite dev server proxies `/_plumix/rpc` and `/_plumix/auth` to
`:5173`, so RPC and auth still hit the real backend. Best for "I'm tweaking
a component, want hot reload."

Override the proxy target for a remote/non-default backend:

```bash
PLUMIX_BACKEND_URL=http://192.168.1.10:5173 pnpm dev
```

### Turbo shortcut: `pnpm dev` from repo root

Runs both workspaces in parallel via `turbo watch dev --continue`. Same
two-port layout as the two-terminal variant but in one shell.

### First-time setup

`apps/demo` needs no manual migration step: its per-session Durable Object
database applies its own schema at runtime, so `pnpm dev` (which runs
`plumix migrate generate` first) is enough to bring RPC endpoints up. A
real-D1 app would instead apply migrations up front with
`pnpm plumix migrate apply`.

### End-to-end tests (Playwright + axe-core)

`pnpm test:e2e` launches a dedicated Vite server on `:5180` and runs the
Playwright suite against it. First-time setup needs Chromium installed:

```bash
pnpm exec playwright install --with-deps chromium    # once
pnpm test:e2e                                         # each run
```

The default suite is an accessibility baseline — axe-core with WCAG 2.1 AA
tags run against the landing page. Every new route or feature should add a
spec under `e2e/`.

### Documentation screenshots

`pnpm docs:screenshots` captures the images `apps/docs` publishes and writes
them into `apps/docs/src/assets/`. Run it from the repo root and turbo builds
the admin first; run it here and it uses whatever `dist/` holds.

It runs on the config above as a second Playwright project, so the same build,
the same preview server and the same RPC mocks that back the e2e suite back the
captures too.

Each subject in `screenshots/subjects.ts` names the element it frames by test
id. Framing an element rather than the window means a redesign of the chrome
around it leaves the image alone — and when the markup does move, the id stops
resolving and the command fails naming both the subject and the id, rather than
writing a stale picture.

CI leans on exactly that: the e2e job runs the capture and asserts it succeeds,
so markup that moves fails a pull request instead of reaching a reader. Nothing
compares pixels and no baselines are kept — an image diff would catch cosmetic
drift too, but font rendering and platform differences make it noisy, and a
noisy job gets turned off. CI throws away the images it writes; regenerating the
committed ones is the local act below.

The data is mocked and the clock is frozen, so a re-run on the same machine
rewrites the same bytes. That does not hold across machines: font rasterization
differs between macOS and Linux, and a Chromium bump moves it too, so
regenerating on a different platform produces a whole-image diff for a UI that
never changed. Regenerate where the images were last taken, or expect to
re-take all of them.

Images are committed: the docs build needs no admin instance, and a pull request
diff shows which visuals a change moved.

### Workspace-local scripts

From `packages/admin/`:

```bash
pnpm dev          # Vite dev server on http://localhost:5174/_plumix/admin/
pnpm build        # emits static assets to dist/
pnpm test:unit    # vitest (jsdom + React Testing Library)
pnpm test:e2e     # playwright + axe-core (needs chromium installed once)
pnpm typecheck
pnpm lint

pnpm docs:screenshots   # re-capture the images apps/docs publishes
```

## Stack

- **React 19** + TypeScript
- **TanStack Router** (file-based, with `@tanstack/router-plugin` in Vite)
- **TanStack Query** + `@orpc/tanstack-query` for RPC against the plumix backend
- **Tailwind CSS v4** (`@tailwindcss/vite`) + **shadcn/ui** (new-york style, neutral base)
- **Geist Variable** + **Geist Mono Variable** via `@fontsource-variable/*`
- Vitest + React Testing Library for component tests
- Playwright + @axe-core/playwright for e2e and accessibility baseline

## Directory layout

```
src/
  App.tsx              root component
  main.tsx             Vite entry
  routeTree.gen.ts     generated by @tanstack/router-plugin
  types.d.ts           ambient declarations (fontsource, etc.)

  lib/                 non-React utilities
    constants.ts       ADMIN_BASE_PATH and similar
    orpc.ts            typed oRPC client singleton
    utils.ts           cn() helper for shadcn components

  providers/           React provider wiring
    query-client.ts    createQueryClient factory
    router.ts          createRouter factory
    theme.tsx          ThemeProvider (light/dark/system)
    index.ts           barrel re-export for App.tsx

  components/
    ui/                shadcn-vendored primitives (do not hand-edit — re-add
                       via `pnpm dlx shadcn@latest add <name>` to refresh)

  routes/              file-based routes (see @tanstack/react-router docs)
```

## Adding a shadcn component

```bash
pnpm dlx shadcn@latest add <name>
```

Components land in `src/components/ui/`. Knip is configured to treat that
directory as a vendored component library — unused primitives don't surface
as noise, so add the full set you expect to use.

## How the admin is shipped

Admin build output (`dist/`) is published as the `@plumix/admin` package,
which `plumix` declares as a dependency. At consumer build time, the plumix
Vite plugin resolves `@plumix/admin` from `node_modules` and copies its
`dist/` into the consumer's `dist/_plumix/admin/`, and the active runtime
adapter serves them (see `packages/core/src/runtime/dispatcher.ts`
for the runtime-agnostic request pipeline). Plugin-contributed admin
chunks + the manifest that wires them are planned for a later phase —
see docs/reference/architecture/09-packages/05-admin.md for the full design.
