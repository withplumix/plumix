# Core block migration notes

Internal record of which blocks moved to the v2 `defineBlock` surface and
what each migration changed. Reader audience is the maintainer crew; once
the v1 stubs delete at cutover (#405) this file documents the final
shape of `coreBlocksV2`.

## What changed at the type level

- **`BlockSpec`** — flat shape: `name`, `title`, `icon`, `category`,
  `inputs`, `render`, `defaults`, optional `transforms` / `variations` /
  `client` / `inline` / `capability` / `placeholder` / `inserter`.
- **Dropped**: `schema` (Tiptap node), `attributes` schema config,
  `supports` (per-block design-token declarations), `legacyAliases`,
  `parsePaste`, `keyboardShortcuts`, `markdownShortcuts`, `adminSchema`,
  `adminEditor`. The universal Style slot at the framework layer
  replaces per-block `supports`; design tokens fold into one place.
- **`inputs`** — flat array of `{ name, type, label, options?, … }`.
  Replaces the v1 `attributes` schema + the v1 `adminEditor` Inspector
  rendering.
- **`render`** — single function. No more `schema` + `Component` +
  `adminSchema` split.

## Per-block roster (v2 names in `coreBlocksV2`)

### Text blocks

- **`core/paragraph`** — `body: richtext` input storing a Tiptap doc.
  Render via `renderInlineAll(attrs.body)`. Legacy `attrs.text` plain
  string still rendered as a transitional shim; drops at cutover.
- **`core/heading`** — `level: select (1–6)` + `body: text` (richtext
  upgrade lands with the next paragraph follow-up). Render emits the
  `h<level>` element.
- **`core/quote`** — `text: text` + `citation: text`. Renders
  `<blockquote cite="…">{text}</blockquote>`.
- **`core/code`** — code block.
- **`core/separator`** — `<hr>`.

### Inline / structural

- **`core/spacer`** — `inline: true`, emits a sized `<div>` with no
  wrapper.
- **`core/details`** + **`core/details-summary`** — collapsible disclosure.
- **`core/callout`** — variant select + slotted content.

### List family

- **`core/list`** — Bullet + Numbered shipped as `variations`. Single
  block with `variant: bullet | numbered` attr; render switches `<ul>` /
  `<ol>`. `start` attr surfaces on the numbered variation.
- **`core/list-item`** — `inline: true`, emits `<li>` directly.

### Description list

- **`core/description-list`** + **`core/description-term`** +
  **`core/description-detail`** — three blocks composing `<dl><dt><dd>`
  semantics.

### Layout

- **`core/group`** — `layout: flow | flex-row | flex-column | grid` +
  `content: slot`.
- **`core/columns`** — multi-slot block (`left`, `right`, etc.).
- **`core/buttons`** + **`core/button`** — button group + button.

### Tables

- **`core/table`** + **`core/table-header-row`** +
  **`core/table-body-row`** + **`core/table-header-cell`** +
  **`core/table-cell`** — five blocks composing `<table><thead><tbody>`
  semantics.

## Media plugin (`@plumix/plugin-media`)

Five v2 blocks shipped via `mediaBlocksV2`:

- `media/image` — figure + img with focal-point cropping (object-position).
- `media/gallery` — grid container with `content: slot` for `media/image`
  children.
- `media/video` — `<video>` with poster + controls.
- `media/audio` — `<audio>` with controls.
- `media/file` — download anchor with size + MIME label.
- `media/embed` — oEmbed-style client island.

Each block ships alongside its v1 sibling. v1 stubs delete at cutover.

## Marks

All 13 inline marks ride Puck's `richtext` field via `coreMarkExtensions`:

- **Puck-bundled (Tiptap defaults)**: bold, italic, strike, code, link,
  underline. Each carries its standard `Cmd+B` / `Cmd+I` / etc. shortcut.
- **Plumix-specific (custom Tiptap extensions)**: subscript, superscript,
  highlight, kbd, abbr, cite, small. Available via Inspector menu in the
  richtext field; keyboard shortcuts declared per-mark in `defineMark`.

`linkSchema` sanitises href at `parseHTML` + `renderHTML` so unsafe
schemes never enter the editor doc.

## Walker

`packages/blocks/src/marks/render-inline.tsx` is the shared walker that
turns a Tiptap doc into React nodes. Two entry points:

- `renderInline(doc)` — first paragraph's inline run.
- `renderInlineAll(doc)` — one `<p>` per paragraph child.

Both apply marks via the shared `SIMPLE_MARK_TAGS` map + dedicated
`link` / `abbr` handlers. The walker re-sanitises link hrefs as defense
in depth.

## Tests + utilities

`plumix/blocks/test` exports two SSR helpers used by every v2 block's
colocated tests:

- `renderBlockSpecToHtml(spec, attrs)` — single-block render.
- `renderBlockTreeToHtml(specs, tree)` — slot composition + multi-block
  trees.

Both return HTML strings produced by `react-dom/server.renderToStaticMarkup`.
The walker emits `data-plumix-block="<name>"` on a wrapper `<div>` for
every non-inline block, so test assertions can anchor on either the
wrapper or the block-specific markup inside.

## Out of scope at this PR

- v1 stub deletion (lives at cutover #405).
- Admin runtime wiring for plugin-contributed v2 blocks via
  `ctx.registerBlockSpec` (separate plumbing slice).
- Full richtext upgrade for heading / quote / callout summary / details
  summary — paragraph is the only block whose `inputs` use `richtext`
  today.
