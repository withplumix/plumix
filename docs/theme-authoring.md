# Theme-authoring guide

A theme is a function. Pass it tokens, optional breakpoints, and a `setup`
callback that runs at theme activation. The theme is registered through the
Plumix config; switching themes re-runs every theme's setup so overrides
roll back cleanly.

## Minimum-viable theme

```ts
import { defineTheme } from "plumix/theme";

export default defineTheme({
  name: "acme",
  tokens: {
    colors: {
      brand: { value: "#0070f3", label: "Brand" },
      ink:   { value: "#111111", label: "Ink" },
    },
    spacing: {
      sm: { value: "0.5rem", label: "Small" },
      md: { value: "1rem",   label: "Medium" },
      lg: { value: "2rem",   label: "Large" },
    },
    typography: {
      base: { value: "1rem", label: "Body" },
      lg:   { value: "1.25rem", label: "Large" },
    },
  },
});
```

Tokens render as CSS variables (`var(--plumix-colors-brand, #0070f3)`),
so theme switching at runtime is a `:root` style rewrite rather than a
re-render.

## Token buckets

The framework knows about these buckets out of the box:

- `colors`
- `spacing`
- `typography` (size)
- `fontFamily`
- `fontWeight`
- `letterSpacing`
- `border` (width / radius)
- `boxShadow`
- `textShadow`

Each token is a `{ value, label }` pair. `value` is a CSS value (any
string CSS accepts including `clamp()`, `min()`, `max()`, raw colors,
named colors, gradients). `label` is what content editors see in the
Inspector's Style tab.

## Responsive token values

Tokens can encode fluid responsive behaviour without leaving the token
layer:

```ts
typography: {
  hero: { value: "clamp(2rem, 4vw + 1rem, 4rem)", label: "Hero" },
}
```

Use this when the size scales linearly with viewport. Use per-viewport
overrides at the block level only when an instance needs to deviate from
the token's default scaling.

## Breakpoints

Default viewport breakpoints (in pixels) are:

- `small` — below 640
- `medium` — 640 to 1024
- `large` — 1024 and above

Override at theme-level:

```ts
defineTheme({
  name: "acme",
  breakpoints: { small: 600, medium: 960, large: 1280 },
  tokens: { /* … */ },
});
```

The walker emits responsive overrides as `@media (max-width: …)` rules
matching the configured pixel widths.

## Block overrides

A theme can replace any registered block's render by re-declaring the
block with the same name inside `setup`:

```ts
defineTheme({
  name: "acme",
  setup: (themeCtx) => {
    themeCtx.defineBlock({
      name: "core/quote",
      // Re-declare the full BlockSpec — the theme's spec wholly replaces
      // the core block.
      inputs: [
        { name: "body", type: "richtext", label: "Body" },
        { name: "citation", type: "text", label: "Citation" },
      ],
      defaults: { body: { type: "doc", content: [{ type: "paragraph" }] } },
      render: ({ attrs }) => (
        <figure className="acme-quote">
          <blockquote>{/* … */}</blockquote>
          <figcaption>{attrs.citation}</figcaption>
        </figure>
      ),
    });
  },
});
```

Theme block overrides apply at theme activation. Switching themes
restores the previous registry — there is no permanent registry
mutation.

## Override precedence

`theme > plugin > core`. A theme block override beats a plugin's block
which beats `coreBlocks`. The `mergeBlockRegistry` call in `buildApp`
applies precedence at startup; subsequent theme switches re-merge.

## Override etiquette

- Match the existing `inputs` shape if possible. Changing input names is a
  schema change for stored entries; the override should accept the same
  attrs the previous block did.
- Document the override in the theme README so site operators know which
  blocks are themed.
- For minor adjustments (CSS-variable rebinding, colour tweaks), prefer
  token overrides over full block re-declarations.

## Testing

Themes can be tested via the same `plumix/blocks/test` helpers — render
the overridden block through the test registry and assert markup. See the
[block-authoring guide's testing section](./block-authoring.md#testing).

## See also

- [Block authoring](./block-authoring.md) — full `defineBlock` surface.
- [Responsive guide](./responsive.md) — per-viewport overrides at the
  block instance level.
