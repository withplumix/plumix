# @plumix/blocks

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
