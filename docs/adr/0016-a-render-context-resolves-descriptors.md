# A render context resolves descriptors; hosts pass catalogs, never strings

A block's `render` runs in three hosts: the public route's SSR, edit-mode SSR,
and the editor canvas's client re-render inside an iframe. Before #2482 none of
them gave the block a way to localize its text, so render-time strings were
hardcoded English: empty-state prompts, a file's "Download" fallback and an
embed's `aria-label` among them. The one string that had been solved, the
canvas's "Add a block", was resolved by the admin host and pushed across the
bridge as a finished string. Each further string would have cost a field in the
bridge message, both connection modules and the canvas state.

> **`BlockContext.t(descriptor, values?)` resolves a `{ id, message }`
> descriptor against a compiled catalog for the render's locale. Each host
> hands the walker a catalog (`renderBlockTree`'s `catalog` option) and never a
> resolved string. With no catalog, `t` returns the descriptor's English
> `message`, never its id.**

A block that adds a string writes the descriptor inline and adds one catalog
entry. No host, bridge or protocol changes.

- **Resolver.** `resolveMessage` in `@plumix/blocks` does a plain object lookup
  over Lingui's compiled output, with simple `{name}` placeholders. It is the
  helper core's admin bar and welcome screen used to carry one copy each. The
  blocks package takes no `@lingui/*` dependency, because it renders on the
  Worker, in the canvas and in the admin.
- **SSR.** Core merges the blocks package's catalog (a static import, since
  core depends on blocks) with every plugin's catalog for `ctx.locale`. It
  memoizes the result per locale and passes it through `PlumixProvider`.
  Plugin catalogs reach the Worker through `virtual:plumix/plugin-catalogs`.
  The Vite plugin generates that module from the `i18n` slot each plugin
  already declares, and the runtime entry passes it to `buildApp`.
- **Canvas.** The host's existing `host:config` message carries the active
  locale and the catalog the admin already merged (its own, the editor's, each
  workspace plugin's and the blocks package's). There is one merge, not a
  second one for the canvas. Until that message arrives the canvas renders at
  the page's locale from the render-env embed (#2630) with English strings;
  the host's locale then replaces it, so the locale and the catalog a block
  reads always belong together.
- **Where a string's catalog lives** follows the dependency direction. A
  blocks-package string lives in `packages/blocks/locales`. A plugin's string
  lives in the plugin's catalog. `plumix i18n verify` gates both.

## Considered options

- **Pre-resolved strings per host** (rejected). This is how `addBlockLabel`
  worked. Its cost grows with every string, and it can't reach SSR at all.
- **Lingui's runtime inside blocks** (rejected). It would add a dependency and a
  global `activate()` singleton to a package that renders per-request on a
  Worker. The admin bar had already rejected the singleton for the same reason.
- **Leave render strings English until visitor content i18n lands**
  (rejected). Two of them are accessibility labels on the public page, which
  the localization rule names explicitly.

## Consequences

- The blocks package's catalog now carries every descriptor in its source,
  core-block metadata included. It replaces admin-editor's `block-i18n` mirror,
  which existed only because blocks had no catalog. Render-time ids never
  needed that mirror.
- A "use client" island hydrates from its props alone, with no render context
  on the client. The block that renders the island resolves the island's
  strings and passes them in as props (the embed facade's `loadLabel`). The
  client-only island placeholder (`Client-only: {name}`) comes from a chunk
  that never imports the renderer, so this seam can't reach it.
- A third-party plugin's catalog reaches SSR through the same slot. It does not
  reach the canvas: the canvas only has what the admin merged at boot, and
  fetching third-party catalogs into it is separate work.
- A custom runtime adapter that doesn't wire `virtual:plumix/plugin-catalogs`
  renders plugin strings in English. It doesn't fail.
