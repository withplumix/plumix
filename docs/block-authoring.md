# Block-authoring guide

A block is a themeable rendering primitive: a name, an icon, a flat list of
`inputs`, default attribute values, and a React `render` function. The editor
canvas and the SSR walker both consume the same `BlockSpec`. There is no
schema/component split, no Tiptap node, no per-block mark registration.

## Minimum-viable block

```tsx
import { defineBlock } from "plumix/blocks";

export const calloutBlock = defineBlock({
  name: "acme/callout",
  title: "Callout",
  icon: "Megaphone",
  category: "text",
  inputs: [
    { name: "text", type: "text", label: "Body" },
    {
      name: "variant",
      type: "select",
      label: "Variant",
      options: [
        { label: "Info", value: "info" },
        { label: "Warning", value: "warn" },
      ],
    },
  ],
  defaults: { text: "", variant: "info" },
  render: ({ attrs }) => (
    <aside role="note" data-variant={attrs.variant}>
      {attrs.text}
    </aside>
  ),
});
```

That is the entire surface — register it via the plugin context's
`ctx.registerBlock(calloutBlock)` and the editor shows it in the Blocks tab,
the slash menu, and the SSR `<EntryContent>` walker.

## `BlockSpec` fields

| Field | Required | What it does |
| --- | --- | --- |
| `name` | yes | Globally unique block name (`namespace/slug`, lowercase). |
| `title` | recommended | Display label in the Blocks tab and slash menu. |
| `description` | no | Sub-label in inserter rows. |
| `icon` | no | Lucide icon name shown in the inserter. |
| `category` | no | Inserter section grouping. |
| `keywords` | no | Extra search tokens for the slash-menu filter. |
| `inserter` | no | Set `false` to register a block that other blocks emit but the inserter hides. |
| `inputs` | no | Flat array of field declarations. |
| `defaults` | no | Initial attribute values for newly-inserted blocks. |
| `placeholder` | no | Empty-state copy shown when the block has no content. |
| `capability` | no | Gate insertion + visibility on a named capability. |
| `inline` | no | Skip the wrapper `<div data-plumix-block>` and emit the rendered element bare. |
| `transforms` | no | Convert-to / convert-from descriptors surfaced in the action bar. |
| `variations` | no | Pre-set attr configurations surfaced as their own inserter entries. |
| `client` | no | Hydration descriptor for browser-side interactive blocks. |
| `render` | yes | React function that receives `{ attrs, context }` and returns the block UI. |

## Inputs

The `inputs` array drives the right-rail Inspector. Each input becomes a
single field in the editor; the value travels to the block's `render` via
`attrs[name]`. Type-flow from `inputs` into `render` is preserved by
TypeScript, so the render function's `attrs` is typed against the inputs.

### Supported `type` values

- `text`, `textarea`, `number` — Puck-native primitives.
- `select`, `radio` — discriminated by `options: [{label, value}]`.
- `checkbox` — translator surfaces a Yes/No radio so the field returns booleans rather than the string `"true"`.
- `slot` — accepts child blocks.
- `richtext` — Tiptap-backed inline rich text with all marks available.

### Reference and media field types

- `image`, `image[]` — registered by `@plumix/plugin-media`. Plug the picker in via the media plugin.
- `entry`, `entry[]`, `term`, `term[]`, `user`, `user[]` — reference pickers.
- `date`, `datetime`, `time`, `email`, `url`, `password`, `range`, `color`,
  `multiselect`, `json`, `repeater` — see the field-type catalog reference
  for the full inventory.

Custom field types register through `ctx.registerFieldType(...)` from a
plugin's `setup` function.

## Slot fields

A `slot` input accepts child blocks. The render receives the slot as a
React component the block spreads where children belong:

```tsx
inputs: [
  { name: "layout", type: "select", options: [...] },
  { name: "content", type: "slot", label: "Items" },
],
render: ({ attrs }) => {
  const Content = attrs.content as (() => ReactNode) | undefined;
  return (
    <div data-layout={attrs.layout}>
      {Content ? <Content /> : null}
    </div>
  );
},
```

The Component is provided by the walker (or Puck in the editor). Children
serialize as `BlockNode[]` inside `attrs.content`. Multi-slot blocks
(Columns, Tabs) declare each slot with its own `name`.

## Variations

Variations are pre-set attribute configurations that surface as their own
inserter entries. `core/list` ships Bullet and Numbered as variations of a
single block:

```tsx
variations: [
  { slug: "bullet", title: "Bullet list", icon: "List" },
  { slug: "numbered", title: "Numbered list", icon: "ListOrdered",
    attrs: { variant: "numbered" } },
],
```

Each variation's `attrs` merges over `defaults`. Selecting a variation in
the slash menu or Blocks tab inserts the parent block with the merged
attrs applied.

## Transforms

Transforms surface in the action bar as "Transform to" rows. Each entry
in `transforms.to` names a target block + an attribute mapper:

```tsx
transforms: {
  priority: 50,
  to: [
    { target: "core/heading", mapAttrs: (a) => ({ level: 2, body: a.body }) },
    { target: "core/quote", mapAttrs: (a) => ({ body: a.body, citation: "" }) },
  ],
},
```

The reverse direction is derived automatically — if `B` declares a
`transforms.to[].target === "A"`, then `A`'s action bar surfaces a
"Transform to B" row computed from B's mapper inverse.

## Client islands

Blocks with browser-side interactivity declare a `client` descriptor:

```tsx
client: { script: "/_plumix/admin/assets/media-embed.client.js" },
```

The SSR walker emits a placeholder `<div data-block>` plus a `<script
type="module">` adjacent. The script hydrates the React component on the
client. Use this for carousels, accordions, anything that needs JS.

## Inline blocks

`inline: true` opts out of the universal wrapper `<div data-plumix-block>`.
The render function then receives `style`/`className` it must apply to its
own root element. Use this for layout-sensitive blocks (Spacer,
Description Term, anything that must be a specific HTML element at the
root).

## Capability gating

A `capability: string` on a block hides the block from the Blocks tab and
slash menu for viewers whose role doesn't grant the capability. Server-
side validation rejects inserts that bypass the client filter.

## Testing

`plumix/blocks/test` ships SSR helpers:

```ts
import { renderBlockSpecToHtml, renderBlockTreeToHtml } from "plumix/blocks/test";

test("renders the variant data attribute", () => {
  const html = renderBlockSpecToHtml(calloutBlock, { variant: "warn" });
  expect(html).toContain('data-variant="warn"');
});
```

Use `renderBlockSpecToHtml(spec, attrs)` for single-block assertions and
`renderBlockTreeToHtml(specs, tree)` for slot composition.

## See also

- [Theme authoring](./theme-authoring.md) for overriding blocks at theme load.
- [Plugin author guide](./plugin-author.md) for registering blocks from a plugin.
- [Field-type catalog](./field-types.md) for the full input type list.
- [Responsive guide](./responsive.md) for per-viewport styling.
- [Keyboard shortcuts](./keyboard-shortcuts.md) for editor accelerators.
