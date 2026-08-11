# @plumix/blocks

## 0.12.0

### Minor Changes

- [#1730](https://github.com/withplumix/plumix/pull/1730) [`fff6e4a`](https://github.com/withplumix/plumix/commit/fff6e4a134e03a6fa1276c8d0d3d23c8cd7e134a) Thanks [@nasyrov](https://github.com/nasyrov)! - Add optional per-entry-type scoping for editor blocks.

  Blocks registered via `ctx.registerBlock` were global — offered in every entry
  type's inserter — and the only lever was `inserter: false`, which hides a block
  from _every_ palette. There was no way to offer a block for one entry type and
  nowhere else.

  A block spec can now declare an optional `entryTypes` allow-list:

  ```ts
  defineBlock({ name: "eduscope/hero", entryTypes: ["school"], render });
  ```

  Unset = every type (the unchanged default, so nothing changes for existing
  blocks); set = the block appears only in those entry types' inserters, and is
  hidden when the entry type doesn't match or is unknown. This mirrors the existing
  `PatternSpec.entryTypes` scoping. It constrains only the editor's
  available-blocks palette — the render registry stays global and save-time
  validation is untouched, so a block already stored on an entry still renders and
  still validates regardless of the type it lives on.

### Patch Changes

- [#1680](https://github.com/withplumix/plumix/pull/1680) [`b124789`](https://github.com/withplumix/plumix/commit/b1247897f2044ad4e7f975ce2d0b8294fd0939af) Thanks [@nasyrov](https://github.com/nasyrov)! - Install the dev-only client error tools from one core-owned entry point.

  The island error dialog, the browser-errors-to-terminal forwarder, and the
  compile/import error overlay are now installed from a single browser-safe
  `@plumix/core/dev-client` export (reached through the `plumix` package as
  `plumix/core/dev-client`), which the generated client bootstrap calls behind the
  `import.meta.hot` dev gate. `@plumix/blocks`'s island runtime no longer installs
  any overlay or forwarder — it only hydrates islands and dispatches the
  `plumix:island-*` events the core-installed dialog listens for. The dependency
  runs core → blocks (no cycle), and nothing in `@plumix/blocks` outside its
  `dev-error/` implementation imports dev-error.

  This is behind the existing `PLUMIX_DEV` / `import.meta.hot` gates, so it
  tree-shakes out of production exactly as before: an island hydration mismatch
  still shows the dialog, a Vite compile error still shows the overlay, and client
  errors still forward to the terminal — now all wired from one place.

  The `plumix/blocks/dev-error` subpath — an internal wiring seam the generated
  client bootstrap used to reach the compile overlay — is removed, since install
  now goes through `plumix/core/dev-client`. The dev-error implementations
  themselves remain in `@plumix/blocks` and are unaffected.

- [#1704](https://github.com/withplumix/plumix/pull/1704) [`56e416a`](https://github.com/withplumix/plumix/commit/56e416af8e753cc07cd0f87a26af4ef0c6fc343c) Thanks [@nasyrov](https://github.com/nasyrov)! - Fix `IslandPropSerializationError: Cyclic reference` when a `"use client"` island
  renders a shared client primitive such as a Radix/shadcn context component (e.g.
  `Tabs`).

  Island props are now serialized exactly once, at the outermost boundary. A
  `"use client"` component becomes an island when it carries an explicit hydration
  directive (`client=…`) or is the outermost such component in the render; a
  non-directive `"use client"` component rendered inside an island now renders
  inline (bundled into the parent island) instead of becoming its own island and
  re-serializing props. This stops the serializer from walking the cyclic React
  Context objects that libraries like Radix thread through their internals.

  Components passed into an island as `children`/slots still become their own
  island and hydrate independently, and intentional nested islands (an explicit
  `client=` directive) are unchanged.

## 0.11.0

### Minor Changes

- [#1670](https://github.com/withplumix/plumix/pull/1670) [`77ef988`](https://github.com/withplumix/plumix/commit/77ef988411eed32144bd4d5fabcc497fbbbac9ef) Thanks [@nasyrov](https://github.com/nasyrov)! - Flag island hydration mismatches in development.

  In `plumix dev`, a hydrating island now mounts with React `hydrateRoot` instead
  of `createRoot`, so a non-deterministic render — a `Date.now()`, `Math.random()`,
  or locale read that differs between the Worker SSR pass and the browser — no
  longer fails silently. React recovers by client-rendering the subtree (no crash)
  and reports the divergence, which the renderer dispatches as a
  `plumix:island-hydration-mismatch` event carrying the island element and React's
  component stack. The dev island-error overlay renders it through the shared
  dev-error page, named and labeled by the island's component, so the offending
  island is flagged by name.

  Production is unchanged, byte-for-byte: the `hydrateRoot` swap and the whole
  diagnostic stay gated on `process.env.PLUMIX_DEV` and tree-shake out of
  production island bundles, where every island keeps mounting with `createRoot`.
  A `client="only"` island ships no server output, so it also keeps mounting fresh
  with `createRoot` and is never reported as a mismatch.

- [#1672](https://github.com/withplumix/plumix/pull/1672) [`168466a`](https://github.com/withplumix/plumix/commit/168466a3e473a81ce77c0acff6678bbeac1dea9b) Thanks [@nasyrov](https://github.com/nasyrov)! - Show _what_ diverged on an island hydration mismatch, not just that it did.

  When a dev-hydrating island's server and client renders disagree, the renderer
  now captures the island's own HTML at two points — before `hydrateRoot` (the
  server render) and after React's recovery re-render (the client render) — and
  carries both on the `plumix:island-hydration-mismatch` signal. The shared
  resolved-error contract (`DevErrorInfo`) gains one optional `hydrationDiff`
  field for that server/client pair, and the dev-error page renders a
  server-vs-client diff section when it is present — leading, above the raw
  component stack — so the developer sees the exact markup that changed. Both
  captured strings render as escaped text, never re-parsed.

  Surfaces that do not set the field are unchanged: an SSR error, an island
  component throw, or a mismatch with no captured pair renders exactly as before.
  Production stays untouched — the capture lives inside the existing
  `process.env.PLUMIX_DEV` branch and tree-shakes out.

## 0.10.0

### Minor Changes

- [#1661](https://github.com/withplumix/plumix/pull/1661) [`5743bfc`](https://github.com/withplumix/plumix/commit/5743bfc95516d55c67d633f4b61a4c9a1e092f8d) Thanks [@nasyrov](https://github.com/nasyrov)! - Retain forwarded client errors in a dev ring behind a read endpoint.

  In `plumix dev`, the browser-errors-to-terminal forwarder now also keeps each
  already-sourcemapped client failure — uncaught exceptions, unhandled rejections,
  island and hydration errors, and forwarded `console` errors/warnings — in a
  bounded ring alongside the existing terminal print. The ring is capacity- and
  byte-bounded with per-string truncation, mirroring the server-side request
  history store, so a burst of client errors can't pin memory.

  A new dev-only GET endpoint returns the retained entries newest-first, each
  preserving `source: "client"`, its level, message, resolved stack, and the
  island/component label when present. This is the client half of the dev-only MCP
  `error_list` surface: the worker-side tool merges these entries with its
  server-side projection. Terminal printing is unchanged, and the whole path stays
  gated on `process.env.PLUMIX_DEV` and tree-shakes out of production.

## 0.9.0

### Minor Changes

- [#1649](https://github.com/withplumix/plumix/pull/1649) [`09e89b8`](https://github.com/withplumix/plumix/commit/09e89b88a7e8cbabe96baf7413c3c38149db905e) Thanks [@nasyrov](https://github.com/nasyrov)! - Let plugins contribute panels to the `plumix dev` error page.

  The dev error page already shows fixed request / route / database / timeline /
  application context below the stack. A plugin can now add its own section
  through a new dev-only `error_page:panels` filter, mirroring how it contributes
  to the debug bar via `debug_bar:panels`:

  ```ts
  "error_page:panels": (
    panels: readonly DevErrorPanel[],
    error: unknown,
    ctx: AppContext,
  ) => readonly DevErrorPanel[];
  ```

  Each `DevErrorPanel` is `{ id, title, order?, render }`, where `render(error,
ctx)` returns a `ReactNode` over the caught value and the live request context —
  the same pair the `error_page:hints` filter receives. Core collects the filter
  `applyFilterIsolated`-safe, dedupes by id (last wins), orders by ascending
  `order`, and renders each panel in its own isolated SSR pass, so a throwing
  subscriber or a panel that throws from `render` degrades to a notice rather than
  crashing the very page meant to surface the error. Contributed panels appear as
  their own sections below the built-in context.

  Core registers none of its own — its built-in sections cover the common case —
  so this filter is purely the plugin-facing panel API. The whole surface stays
  behind the `PLUMIX_DEV` gate and tree-shakes out of production builds.

- [#1651](https://github.com/withplumix/plumix/pull/1651) [`36ce243`](https://github.com/withplumix/plumix/commit/36ce24381eee89688b18cd77255bb9fb29429407) Thanks [@nasyrov](https://github.com/nasyrov)! - Adds an open-in-editor path remap for container and remote dev servers.

  The dev error page's "Open in editor" links use the file path as the dev server
  sees it, which doesn't exist on your machine when the server runs in a container,
  a devcontainer, or on a remote/SSH box. Set `PLUMIX_EDITOR_PATH_MAP` to a
  `from=>to` mapping (e.g. `/workspace=>/Users/me/proj`) and the on-server path
  prefix is rewritten to the editor-host path before each link is built, so the
  links open the right file. Only the path prefix is remapped, on a path boundary;
  paths outside it are left untouched. Like `PLUMIX_EDITOR`, it is read only in
  `plumix dev` and tree-shakes out of production builds.

- [#1647](https://github.com/withplumix/plumix/pull/1647) [`2d6753a`](https://github.com/withplumix/plumix/commit/2d6753a26e55df944bc194564190990db1b775ec) Thanks [@nasyrov](https://github.com/nasyrov)! - Add an opt-in `log` level to the dev browser-errors-to-terminal forwarder.

  The forwarder ([#1604](https://github.com/withplumix/plumix/issues/1604)) deliberately mirrors only `console.error`/`console.warn`
  and uncaught exceptions to the `plumix dev` terminal, because plain logs are
  noisy. Setting `PLUMIX_FORWARD_ERRORS=log` now additionally forwards
  `console.log`, `console.info`, and `console.debug`, printed through the same
  `[browser]`-tagged, sourcemapped, repeat-collapsing path as everything else — so
  the verbose case stays on one contract rather than splitting output to Vite's
  native `forwardConsole`. The default is unchanged (`warn`), and the whole path
  remains dev-only and tree-shaken from production island bundles.

- [#1643](https://github.com/withplumix/plumix/pull/1643) [`a9f5648`](https://github.com/withplumix/plumix/commit/a9f56484cb25875cd895538018139a706dc2ba80) Thanks [@nasyrov](https://github.com/nasyrov)! - Unify Vite's compile/import errors with the dev error surface.

  In `plumix dev`, a syntax error or a bad import used to show Vite's own error
  overlay — visually and behaviorally disjoint from the plumix dev error page and
  the client island overlay. Plumix now disables Vite's built-in overlay
  (`server.hmr.overlay: false`) and installs its own from the always-present dev
  client entry: it intercepts Vite's `vite:error` HMR payload and renders it
  through the _same_ shared `DevErrorPage` renderer and token sheet, in a Shadow
  DOM modal over a dimmed backdrop. So compile errors now read like every other
  plumix dev error — same header, code frame, and styling — and clear on their own
  when the module recompiles (Escape, the close button, or a backdrop click also
  dismiss). The whole surface is dev-only, gated on `import.meta.hot`, so it
  tree-shakes out of the production client bundle; a user can re-enable Vite's own
  overlay from their `vite` config.

## 0.8.0

### Minor Changes

- [#1621](https://github.com/withplumix/plumix/pull/1621) [`976fc4d`](https://github.com/withplumix/plumix/commit/976fc4dc102529c25c6509da89e6bce151945dd5) Thanks [@nasyrov](https://github.com/nasyrov)! - Forward browser/island errors to the dev terminal.

  In `plumix dev`, client failures now also surface where the developer is already
  working. A dev-only catch net mirrors the island error overlay's producers —
  uncaught exceptions, unhandled rejections, and the island renderer's
  `plumix:island-error` / `plumix:hydration-error` events — and additionally
  patches `console.error` and `console.warn` (never `console.log`). Each entry is
  batched and POSTed to a new Vite dev-server endpoint, which sourcemaps the stack
  through the dev server's per-module sourcemaps and prints it tagged `[browser]`
  with a project-relative `file:line`, application frames shown and framework
  frames collapsed to a count. Consecutive identical entries collapse into a
  running `(×N)` count.

  On by default and tuned by `PLUMIX_FORWARD_ERRORS` (`off` disables, `error`
  drops warnings, the default forwards both). Everything is gated on
  `process.env.PLUMIX_DEV` and tree-shakes out of production island bundles.
  Vite 8's native `forwardConsole` is disabled by the plugin so client output
  isn't printed twice; a consumer can re-enable it in their own `vite` config.

- [#1618](https://github.com/withplumix/plumix/pull/1618) [`077c515`](https://github.com/withplumix/plumix/commit/077c515e47d3e807d61b5ed4a0ff7cbc94839eff) Thanks [@nasyrov](https://github.com/nasyrov)! - Add a dev-only client island error overlay.

  When an island fails in `plumix dev` — during hydration, after hydration (a
  render/effect throw, captured with its React component stack), or via an async
  error or unhandled rejection — a small, non-blocking indicator now appears in
  the bottom-left corner. Clicking it opens a centered modal (the Next.js
  dev-overlay shape) showing the message, the component stack, and the stack
  trace, rendered through the shared dev error renderer inside a Shadow DOM root
  so a broken theme can't style it; the close button, Escape, or a backdrop click
  returns to the indicator, and the page stays visible behind. A failing island no
  longer breaks the rest of the page or the other islands; multiple errors are
  counted and navigable. Everything stays gated on `process.env.PLUMIX_DEV` and
  tree-shakes out of production island bundles.

- [#1609](https://github.com/withplumix/plumix/pull/1609) [`741c6b4`](https://github.com/withplumix/plumix/commit/741c6b4b0c731e3fe8efd1c316a0ea4fd23b6e0d) Thanks [@nasyrov](https://github.com/nasyrov)! - Show actionable "how to fix" hints on the `plumix dev` error page.

  When a recognized error reaches the dev error page, it now surfaces a prominent
  "how to fix" card above the stack. Core matches its own typed errors (e.g.
  `ThemeRegistrationError`) and a curated set of common untyped pitfalls — a D1
  `no such table` points at `plumix migrate`, a missing secret points at
  `.dev.vars`, a missing binding points at `wrangler.jsonc`. Unrecognized errors
  render no card.

  Hints are contributed through a new dev-only `error_page:hints` filter that
  mirrors `debug_bar:panels`: it runs on every dev 5xx with the caught error and
  request context, and plugins subscribe to add or override hints. The shared
  renderer at `@plumix/blocks/dev-error` gains the `DevErrorHint` shape and renders
  the cards. Everything stays gated on `process.env.PLUMIX_DEV` and tree-shakes out
  of production.

- [#1613](https://github.com/withplumix/plumix/pull/1613) [`ec117ea`](https://github.com/withplumix/plumix/commit/ec117ea45ed6ff064807ae2d6cee4dfb5b67cf35) Thanks [@nasyrov](https://github.com/nasyrov)! - Make a throwing block loader dev-fatal in `plumix dev`, naming the block.

  When a block's SSR loader rejects during development, the page now fails to the
  dev error page — naming the culprit block and surfacing the loader's own
  message and the failing query — instead of silently dropping that block from
  the render. In production the same rejection stays isolated to the block
  (degrading to its `errorFallback`, or nothing) and the page still renders, so
  the resilience contract is unchanged.

  The render path captures the first loader rejection and, behind the
  `process.env.PLUMIX_DEV` gate, throws a new `BlockLoaderError` (exported from
  `@plumix/blocks`) that propagates to the dispatcher catch. The wrapper names the
  block and loader key, carries the underlying message so error-page hints keep
  matching through the loader boundary, preserves the original via `cause`, and
  adopts its stack so frames resolve to the failure site. The gate tree-shakes the
  escalation out of production builds.

- [#1617](https://github.com/withplumix/plumix/pull/1617) [`9a1e88a`](https://github.com/withplumix/plumix/commit/9a1e88adb272f1f4795ddfd23e2958b4aa8b9443) Thanks [@nasyrov](https://github.com/nasyrov)! - Open a `plumix dev` error-page stack frame in your editor.

  Each frame on the dev error page now carries an "open in editor" link that jumps
  to the file at the offending line. It is a plain anchor to the editor's URL
  scheme — zero-JS, no server round-trip. The editor is chosen by a dev-only
  `PLUMIX_EDITOR` setting: a known-editor key (`vscode` — the default —
  `vscode-insiders`, `cursor`, `windsurf`, `zed`, `idea`, `phpstorm`, `webstorm`,
  `sublime`), a custom `{file}` / `{line}` / `{column}` format string for any other
  editor, or `off` / `none` to drop the link. Everything stays gated on
  `process.env.PLUMIX_DEV` and tree-shakes out of production.

- [#1606](https://github.com/withplumix/plumix/pull/1606) [`6fe5583`](https://github.com/withplumix/plumix/commit/6fe5583954947ba11093fb053c946640b703b4b0) Thanks [@nasyrov](https://github.com/nasyrov)! - Add a dev-only error page for render throws in `plumix dev`.

  When a theme template throws during render in development, the visitor now gets
  a self-contained, theme-independent 500 page showing the exception name,
  message, and raw stack — instead of re-rendering the failure through the theme
  (which blanks the screen when the theme itself is the culprit). The page is a
  shared, zero-JS renderer exposed at `@plumix/blocks/dev-error` and SSR'd by core
  at the dispatcher catch. It is gated on `process.env.PLUMIX_DEV`, so the page
  and its styles tree-shake out of production builds — the existing themed 500 is
  unchanged.

- [#1608](https://github.com/withplumix/plumix/pull/1608) [`3d269a3`](https://github.com/withplumix/plumix/commit/3d269a399f6e36e499ef60846abe02716103d7a0) Thanks [@nasyrov](https://github.com/nasyrov)! - Resolve dev error-page stack frames to original source with a code excerpt.

  The `plumix dev` error page now parses the (already-sourcemapped) stack into
  frames showing each original `file:line`, with application frames expanded and
  framework/vendor frames collapsed behind a toggle. Selecting a frame shows a
  source excerpt with the offending line highlighted — lazy-fetched from a new
  dev-only source resolver mounted as a Vite middleware, so the worker (which has
  no filesystem) never reads source itself. Paths are shown relative to the
  project root the frames imply. Everything stays gated on `process.env.PLUMIX_DEV`
  and tree-shakes out of production.

- [#1619](https://github.com/withplumix/plumix/pull/1619) [`f379b46`](https://github.com/withplumix/plumix/commit/f379b46b4c863bde6d4235a5753e7fd07926153c) Thanks [@nasyrov](https://github.com/nasyrov)! - Resolve the client island error overlay's stack to original source frames.

  The dev island error overlay now shows the same frame view as the server error
  page instead of a raw browser stack: each frame's original `file:line` (with the
  project base path stripped), application frames expanded and framework frames
  collapsed behind a toggle, and clicking a frame reveals its source excerpt with
  the offending line highlighted.

  Browser stacks carry transformed positions pointing at Vite's served module
  URLs, so a new dev-only Node resolver POSTs the raw stack, maps each frame back
  through the dev server's per-module sourcemaps, and returns the resolved frames.
  The overlay's indicator is now a compact count badge, the modal gives the code
  excerpt the room (a ~30/70 split), long frame names truncate, and the React
  component stack is shown only as a fallback when no frames resolve. Everything
  stays dev-only and gated on `process.env.PLUMIX_DEV`.

### Patch Changes

- [#1620](https://github.com/withplumix/plumix/pull/1620) [`a5be41a`](https://github.com/withplumix/plumix/commit/a5be41a282fc4785c7cec582af0e97b3d99bed8a) Thanks [@nasyrov](https://github.com/nasyrov)! - Give the dev error page's stack frame rows a little more vertical breathing room
  between the function name and its file location.

## 0.7.0

## 0.6.0

## 0.5.0

## 0.4.0

### Minor Changes

- [#1471](https://github.com/withplumix/plumix/pull/1471) [`47ec8e2`](https://github.com/withplumix/plumix/commit/47ec8e293dc3c0dd54da34c63c449182a302745e) Thanks [@nasyrov](https://github.com/nasyrov)! - Add author archives end-to-end: `/authors/{slug}` renders a paginated list of a given author's published entries, themeable like any other archive.

  The full seam is wired: a new `author` `RouteIntent`, framework routes for `/authors/:slug` (+ `/page/:n`), a `resolveAuthor` resolver (the author's published, public-type entries — unknown slug or out-of-range page → 404), an `author` `ResolvedNode`, a generic `author()` template tier, a `forAuthor(slug)` / `forAuthor(id)` targeted builder, and a typed `AuthorArchiveData { author; entries; pagination }`. An author RSS/Atom feed is served at `/authors/{slug}/feed`, and author-archive pages advertise it via `<link rel="alternate">`.

  ```ts
  defineTheme({
    templates: [
      author(AuthorArchive), // every author archive
      forAuthor().slug("jane").template(JaneArchive), // one author, by slug
      forAuthor().id(1).template(FounderArchive), // or by id
    ],
  });
  ```

  Authors are addressed by a new **`users.slug`** column (globally unique, mirroring `terms.slug` / `entries.slug`). It is derived from the user's name via `slugify` at creation — falling back to `user`, de-duplicated with a numeric suffix (`jane`, `jane-1`, `jane-2`), and never derived from the email — and is stable across later name changes. `ResolvedAuthor` now carries `slug`, so `data.author` / `entry.author` can link to an author archive.

## 0.3.0

## 0.2.0

## 0.1.4

## 0.1.3

## 0.1.2

## 0.1.1
