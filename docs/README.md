# Plumix documentation

A headless CMS for the edge, built on Cloudflare Workers.

## Authoring

- [Block authoring](./block-authoring.md) — the `defineBlock` surface,
  inputs, slots, variations, transforms, client islands.
- [Theme authoring](./theme-authoring.md) — tokens, breakpoints, block
  overrides.
- [Plugin author guide](./plugin-author.md) — registering metaboxes,
  blocks, field types, RPC routers from a plugin.
- [Translation guide](./translation.md) — adding a locale, reading
  `.po` entries, ICU plurals, RTL smoke-testing.

## Reference

- [Field-type catalog](./field-types.md) — the 26+ field types and how
  they map to Puck primitives.
- [Core blocks migration notes](./core-blocks-migration.md) — the v2
  block roster shipped in `coreBlocksV2`.

## Surfaces

- [Editor surface](./editor-surface.md) — sidebars, action bar, slash
  menu, viewport switching, publishing, revisions.
- [Keyboard shortcuts](./keyboard-shortcuts.md) — canvas, slash menu,
  sidebars, action bar, rich text.
- [Responsive guide](./responsive.md) — desktop-first cascade,
  per-viewport overrides, fluid tokens.

## Internal

The `agents/` directory carries prompts + glossaries used by coding
agents that work on the codebase. End-user authors can ignore it.
