# A block's definition is editor metadata; its view module holds what renders or runs on the server

The editor's entry imported every block module eagerly, so everything a block
rendered with, and everything that imported, landed in the one `plumix-editor`
chunk (#3529). On eduscope.uk, eager editor JS was 1080 kB. A design refresh
with richer theme blocks took the editor chunk itself past Vite's 500 kB
warning, and it grew with every block a theme added. Tracing the imports from
`.plumix/editor-entry.ts` found five chains:

1. The canvas imported the `@plumix/admin-editor` barrel, which reached the admin
   shell's editor and through `@plumix/admin-ui` the whole `radix-ui` barrel.
   Neither package declared `sideEffects`, so nothing tree-shook. About 124 kB.
2. A block module's imports for its render stayed eager even when unused,
   because Rollup can't prove a component module free of side effects. Islands,
   toasts and Radix rode along.
3. A block's `loaders` imported server code: drizzle tables, their schemas and
   drizzle-orm.
4. `core/code` imported highlight.js, about 106 kB in every site's editor.
5. `core/html`'s sanitizer (DOMPurify, 28 kB) was reached through the baseline
   allowlist the canvas reads.

> **A block's definition holds what the editor needs before anything renders:
> name, title, icon, inputs, defaults, variations, transforms and nesting rules.
> Everything that renders or runs on the server lives in its view module, which
> the definition reaches only through `view: () => import("./x.view")`. The
> module default-exports the view and may export `loaders`, `deps` and
> `errorFallback`. A module is loaded before anything renders it, on the server
> and in the canvas, so nothing suspends and nothing flickers.**

## Precedent

Surveyed 2026-10-31.

- **Gutenberg** splits metadata (`block.json`) from code, but has tried lazy
  block code since 2017 (#2768, PRs #51778 and #55585) and is stuck, because
  `getBlockType`, `createBlock`, transforms and the parser are synchronous and
  need the code. #55585 lazy-loaded `edit` alone and halved `block-library`, but
  brought render-delay flicker and flaky e2e tests.
- **Builder.io and Storyblok** make lazy loading opt-in and warn that
  registering every block grows the bundle. **Craft.js** puts every component in
  one chunk.
- **Payload's** generated import map breaks when it goes stale between dev and
  prod.
- **React Router's** route `lazy()` and **Remix route modules** put the component
  and its `loader` in one lazily imported module. That is the shape adopted
  here.
- **`React.lazy` under `renderToString`** emits its fallback, so a lazy view
  rendered on demand would change the server's HTML.

## What this means

- **Anything synchronous stays in the definition.** The editor's catalog,
  inspector, transforms and validation read only the definition, so none of
  them waits for a module.
- **Loaded before rendered.** `buildApp` loads every view at boot, so SSR stays
  synchronous and its HTML is unchanged. The canvas loads a tree's views before
  it commits the tree, a newer tree superseding one still loading. It loads a
  catalog item's view on hover or focus (`host:prefetch-blocks`) and every
  other view once idle. Rendering, or reading loaders or deps, for a block whose
  view isn't loaded throws `BlockViewNotLoadedError` naming it.
- **One module, several blocks.** The view receives the block's `name`, so a
  module can serve a family of blocks, as `core/table`'s does.
- **The shell never loads a view.** It learns which blocks declare loaders from
  the canvas (`canvas:loader-blocks`), so the inspector still offers Refresh on a
  loader block that has no data yet.
- **No codegen map.** The bundler names the chunks from each `import()`, so
  nothing generated can go stale.
- **Packages declare `sideEffects`.** `@plumix/admin-editor` and
  `@plumix/admin-ui` declare `false`, so the canvas's barrel import drops the
  shell.
- **A build test guards the eager graph.**
  `packages/plumix/src/vite/editor-chunks.test.ts` builds an editor entry and
  fails when a view module, highlight.js, DOMPurify, drizzle-orm, an island or
  the admin shell becomes eager.
- **A CLI command never imports a view.** It evaluates the config outside Vite,
  where a view's CSS import can't load, and it never renders, so the CLI builds
  its app with `skipBlockViews`.
- **Shortcodes keep their synchronous `render`.** They are text-only string
  macros by contract, not views.

This amends [ADR 0040](0040-a-block-declares-its-deps-like-a-template.md): a
block's `deps` is exported from its view module rather than declared on the
definition.

## Considered options

- **Opt-in `lazyRender(() => import(...))` on `render`** (rejected). It fixes
  only the blocks someone remembers to wrap, leaves loaders' server code eager,
  and leaves the editor growing by default.
- **A lazy view alone, with `loaders` and `deps` on the definition** (rejected).
  Loaders import server code, which then stays in the browser.
- **Automatic splitting by the Vite plugin** (rejected). eduscope.uk builds its
  block lists at runtime, so a compile-time rewrite can't find them, and a
  generated map can go stale.
- **Suspense in the canvas** (rejected). It shows a loading state for every
  newly seen block, the flicker Gutenberg hit.

## Consequences

- `defineBlock` takes `view` in place of `render`, `loaders`, `deps` and
  `errorFallback`: a breaking change to every block, migrated in the same change
  for Plumix's own.
- A type check that rejected an unknown dep kind on the definition is gone. A
  view module's `deps` is typed by the view's `BlockViewProps`, which checks the
  keys a view reads but not the kinds a module declares.
- `renderBlockSpecToHtml` and `renderBlockTreeToHtml` are async, and a test that
  renders outside a site calls `loadBlockViews` first.
