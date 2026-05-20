# Editor surface guide

The v2 admin editor has two routes:

- **Editor route** (`/entries/<slug>/<id>/edit` on v2-supports types) —
  Puck-driven canvas with sidebars, action bar, and viewport switching.
- **Plain-form route** — used when an entry type's `supports` list omits
  `editor`. Stacked Cards, autosave, no canvas, no Puck bundle.

Both routes share the same publish + autosave + revisions header.

## Header

- **Title input** — entry title, autosaved with the body.
- **Autosave pill** — Saved / Saving… / Failed to save. Reflects the live
  `entry.update` mutation state.
- **Revisions trigger** — appears when the entry type declares
  `supports: ["revisions"]`. Opens a Sheet listing prior revisions with
  per-revision diff + Restore.
- **Publish button** — promotes the draft to published via `entry.update`
  with `status: "published"`. Disabled once already published.

## Left sidebar

Tabs: **Blocks**, **Outline**, **Audit**.

- **Blocks** — searchable, capability-filtered list of insertable blocks
  and variations. Click to insert at the canvas cursor; or drag
  (returning when the drag-handle slice completes).
- **Outline** — the page's block tree. Click a node to select it on the
  canvas.
- **Audit** — Heading-structure accessibility audit. Lists outline issues
  (skipped levels, missing h1, etc.); click an issue to jump to the
  offending block.

## Canvas

`<Puck.Preview />` renders the block tree as a live editable surface.
Typing `/` at the cursor opens the slash menu; selecting a block reveals
the action bar and switches the right rail to the Block tab.

## Right sidebar

Two states:

### When a block is selected

Tabs: **Block**, **Style**.

- **Block** — the selected block's `inputs`. Each input renders via the
  field-type translator (`text`, `select`, `richtext`, `slot`, etc.).
- **Style** — the universal Style slot. Edits land in the active
  viewport bucket (`large` by default; switches to `medium` / `small`
  when the viewport switcher is engaged). Tokens drive the choices: the
  color picker offers the theme's `colors` tokens, spacing offers the
  theme's `spacing` tokens, etc.

### When nothing is selected

Stacked Accordion of registered metaboxes. Permalink, Status, Excerpt,
plugin-contributed metaboxes — each one its own collapsible section.

## Action bar

Renders below the right-rail header when a block is selected. Native
`<button>` elements; reachable via Tab from the canvas:

- **Transform to** — per-target buttons derived from the block's
  `transforms.to` + the symmetric inverse of other blocks' `transforms.from`.
- **Duplicate** — clones the selected block in place.
- **Delete** — removes the selected block.
- **Copy JSON** — copies the block's serialized JSON to the clipboard.

The full keyboard map lives in [keyboard-shortcuts.md](./keyboard-shortcuts.md).

## Slash menu

Cursor-position inserter:

- `/` opens the menu.
- Type to filter by title or keyword.
- Arrow keys move focus; Enter inserts.
- Escape dismisses.

The menu surface is a listbox (`role="listbox"` via cmdk); the search
input carries `aria-label="Search blocks"`.

Capability-gated blocks are hidden from viewers whose role doesn't grant
the capability.

## Viewport switching

Toolbar control (Mobile / Tablet / Desktop / Wide). Editing the Style
tab while a non-default viewport is active lands the override in that
viewport's bucket; the canvas re-renders at the selected width so the
override is visible immediately.

The active viewport reflects through `data-plumix-viewport-bucket` on
the Style tab so screen readers announce "Editing for: tablet" etc.

## Publish workflow

- **Draft** → **Published**: one-way via the Publish button. Promotes via
  `entry.update({ status: "published" })`; fires `entry:published` plugin
  hooks.
- **Autosave**: 300 ms debounce on every canvas / metabox / Style edit.
  Optimistic-concurrency token (`expectedLiveUpdatedAt`) is sent on every
  save so a stale tab can't clobber a concurrent edit; the server returns
  `CONFLICT` and the editor surfaces a Conflict dialog with Compare /
  Keep mine / Take theirs actions.

## Revisions

For entry types declaring `supports: ["revisions"]`:

- Each successful `entry.update` snapshots the post-write state into a
  revision row.
- The header's **Revisions** trigger opens a Sheet listing prior
  revisions with author + relative time.
- Selecting a revision opens the diff view side-by-side with the live
  entry.
- **Restore this revision** writes the snapshot's content back into the
  live entry via `entry.revisions.restore`, fires the same lifecycle
  hooks as a manual save, and re-runs block-content validation so a
  block deregistered since capture can't surface invalid content.
- Restore does *not* snapshot the post-restore state — restoring a
  revision is invisible to history (matches WordPress's behaviour;
  prevents a duplicate row burning a `maxRevisions` slot).

## Plain-form route

Stacked Cards layout for non-editor entry types. The header carries the
same title input + autosave pill + Revisions trigger + Publish button as
the editor route. Each metabox renders as its own `<section>` with an
`<h2>` heading and `aria-labelledby` wiring. Same `MetaBoxField` renderer
as the editor route — registering a custom field type from a plugin
surfaces it identically in both surfaces.

## See also

- [Keyboard shortcuts](./keyboard-shortcuts.md)
- [Block authoring](./block-authoring.md)
- [Responsive guide](./responsive.md)
