# Responsive styling guide

Plumix's responsive model is **desktop-first cascade with per-viewport
overrides at the block instance level**. Every block has a universal
Style slot the framework owns; per-block design-token declarations
(`supports.spacing.padding`, etc.) no longer exist.

## Viewport buckets

A block's Style slot stores values keyed by viewport bucket:

```ts
style: {
  large?: { padding: "lg", color: "ink" },
  medium?: { padding: "md" },
  small?: { padding: "sm" },
}
```

- `large` is the **base**. Always applies.
- `medium` overrides `large` when the viewport is below the `large`
  breakpoint.
- `small` overrides `medium` when below the `medium` breakpoint.

The walker emits CSS unconditionally with `@media (max-width: …)`
wrappers; the browser's media-query engine handles cascading. No
client-side JS reads viewport width.

## When to use which layer

- **Theme tokens** with fluid values (`clamp()`, `min()`, `max()`) — for
  values that should scale linearly with viewport. One declaration,
  works at every size.
- **Per-viewport block overrides** — for values that *don't* scale
  linearly. A heading that needs to be 64 px on desktop, 48 px on
  tablet, 32 px on mobile (each a discrete step, not a fluid range).
- **Block author's `inline: true` opt-out + custom CSS** — only when the
  block needs control beyond what the universal Style slot supports.

## Editor UX

The viewport switcher in the editor toolbar selects which bucket Style
edits land in:

- **Desktop** active → edits land in `large`.
- **Tablet** active → edits land in `medium`.
- **Mobile** active → edits land in `small`.

The canvas re-renders at the selected viewport width so the override
applies immediately. The Style tab's `data-plumix-viewport-bucket`
attribute reflects the active bucket so screen readers announce
"Editing for: tablet" etc.

## Storage shape

The block-tree stores style buckets directly:

```jsonc
{
  "id": "p1",
  "name": "core/paragraph",
  "attrs": { /* … */ },
  "style": {
    "large": { "padding": "lg" },
    "small": { "padding": "sm" }
  }
}
```

Each value references a token id (`"lg"`, `"sm"`); the walker resolves
the id to `var(--plumix-spacing-lg, 24px)` at render time so token
swaps (theme change at runtime) re-style without re-render.

## Cascade example

A paragraph with `large: { padding: "lg" }` and `small: { padding: "sm" }`
emits:

```css
.plumix-block-p1 { padding: var(--plumix-spacing-lg, 24px); }
@media (max-width: 640px) {
  .plumix-block-p1 { padding: var(--plumix-spacing-sm, 8px); }
}
```

No `medium` declared → medium viewports inherit the `large` value.

## Breakpoints

Theme-controlled (see [theme-authoring guide](./theme-authoring.md#breakpoints)).
Default breakpoints:

- `small` — below 640 px.
- `medium` — 640 to 1024 px.
- `large` — 1024 px and above.

A theme overrides via `defineTheme({ breakpoints: { small: 600, medium: 960, large: 1280 } })`.

## When the Style slot doesn't fit

Some blocks need wrapper-free output (`<a>` for a button, `<li>` for a
list item, `<hr>` for a separator). These blocks declare `inline: true`
and receive `style`/`className` props the render must apply to its own
root element. Inline blocks lose the per-viewport cascade unless the
render function handles the bucketing itself.

## Testing per-viewport overrides

The colocated SSR tests in `@plumix/blocks` already cover the cascade:

```ts
const html = renderToStaticMarkup(
  renderBlockTree(tree, registry, {
    tokens: {
      spacing: { lg: { value: "24px" }, sm: { value: "8px" } },
    },
  }),
);
expect(html).toContain(".plumix-block-p1 { padding: var(--plumix-spacing-lg, 24px); }");
expect(html).toContain(
  "@media (max-width: 640px) { .plumix-block-p1 { padding: var(--plumix-spacing-sm, 8px); } }",
);
```

Pass `tokens` to `renderBlockTree` (or via the walker options) so the
test reflects the active theme's token values.

## See also

- [Theme authoring](./theme-authoring.md) — token declarations + breakpoint customization.
- [Block authoring](./block-authoring.md) — `inline: true` opt-out and block-specific styling.
- [Editor surface](./editor-surface.md#viewport-switching) — the editor's viewport switcher.
