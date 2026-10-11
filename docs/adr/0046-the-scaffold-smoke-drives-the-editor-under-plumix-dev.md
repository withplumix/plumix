# The scaffold smoke drives the editor under `plumix dev`

From 0.13 to 0.24 the editor canvas failed to start under `plumix dev` on any
site that installed a plugin with blocks from npm (#2840). The generated editor
entry imported block modules by absolute path, so Vite's dependency scan
skipped them and a CommonJS import reached the browser raw. #2859 fixed that
one cause. No test could have caught it: every e2e suite runs on
workspace-linked packages, whose symlinked paths the scan crawls anyway, and the
scaffold smoke, the one place that installs the packed tarballs, only built
the project and fetched three URLs from the built server.

> **After its built-server checks, each runtime's `all-plugins` combo in
> `smoke:scaffold` boots `plumix dev` in the same installed project and runs one
> Playwright spec against it in Chromium. The spec loads the front page and
> fails on any uncaught error, logged error, failed request or script response
> of 400 or more. It then
> signs in with `actingAs`, inserts an installed plugin's block in the editor
> and selects it in the canvas. It imports only the project's installed
> `plumix/test/playwright`.**

## What this means

- **Amends ADR 0042.** E2E is no longer the only place a browser runs. The
  smoke runs one spec. A dev server's module graph only links in a browser,
  and only a project installed from the tarballs has the module graph a user
  has. ADR 0042's rule that a behaviour is tested in the lowest tier that can
  observe it puts this in smoke, because no e2e suite can observe it.
- **One spec, not a suite.** Its question is whether the installed project
  works under `plumix dev`: Vite's dependency optimizer, module rewriting and
  the generated entries. Features stay in e2e on the workspace, and #2858 owns
  how deeply the editor is driven there.
- **Every runtime.** The spec runs on Cloudflare, Node and Bun, because each
  adapter wires `plumix dev` differently (ADR 0019).
- **The `Smoke (scaffold)` job installs Chromium.** The project pins
  `@playwright/test` to the version `create-plumix-app` develops against, so the
  browser CI installs is the one it looks for. A failure keeps the trace and
  report as the `smoke-playwright-reports` artifact.

## Considered options

- **Boot `plumix dev` in the release smoke** (`pnpm smoke`), which already runs
  it from a registry install. Rejected: it gates releases only, so a bug would
  surface after eleven minors of merges just as #2840 did. It also runs on
  Cloudflare only.
- **Run an editor e2e spec against `plumix dev` as well as the build.**
  Rejected: the e2e suites link the workspace, the topology that hid the bug.
- **Fetch the editor entry over HTTP without a browser.** Rejected: the failure
  was a module that would not link, which only a browser's module loader
  reports.

## Consequences

- The smoke job downloads Chromium and runs three dev servers more. It keeps
  its 15-minute timeout, which fails a run that grows past it.
- The smoke edits the scaffolded theme to render entry content with
  `BlockRenderer`, since the scaffold's entry template renders only the title
  and excerpt and the canvas needs a content root to mount into.
