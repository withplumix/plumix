# @plumix/admin-ui

The shared shadcn/ui primitives rendered by the admin shell (`@plumix/admin`)
**and** by plugin admin chunks (via `plumix/admin/ui`). One vendored source of
truth so the shell and plugins stay visually consistent.

## Adding a component

```sh
pnpm --filter @plumix/admin-ui ui:add <component>   # e.g. dialog, badge
```

This runs `shadcn add` against this package's `components.json` (components
land flat in `src/`, `cn` imports resolve to `@plumix/admin-ui`), formats the
result, and runs `pnpm roster:sync`. That script derives the `exports` map in
`package.json` and the `src/index.ts` barrel from the modules in `src/`, so
the new component is importable as `@plumix/admin-ui/<component>` and from
`plumix/admin/ui` with no hand-edits. Run it yourself after adding or removing
a module by any other route; the package's roster test fails until you do.

A component already in `src/` is Plumix source, not a vendored copy (ADR 0023):
take an upstream change with `pnpm dlx shadcn@latest add <name> --diff` and
apply it by hand, never by overwriting.

Both lists are generated — don't edit them. A module that must stay out of one
goes in the exception table in `scripts/roster.ts`, with its reason.

## Theme

`components.json` points `tailwind.css` at a placeholder (`unused.css`):
the design tokens live in `@plumix/admin`'s `src/styles/globals.css`, which
already `@source`s this package so the shell CSS carries every component's
classes (plugin chunks inherit them). If a newly-added component needs new
CSS variables or keyframes, add them there.

## Sharing with plugins

The thin wrappers ship as bundled source through `plumix/admin/ui`; their
`radix-ui` / `sonner` / `tailwind-merge` imports are aliased to the host
runtime shims at plugin build time, so plugin chunks reuse the shell's single
radix/sonner/tailwind-merge instance instead of bundling their own.

## Stability

`plumix/admin/ui` is a public API for third-party plugin authors, but these are
components taken from shadcn that we own and edit. It carries no
guarantee beyond plumix's repo-wide policy: **pre-1.0, minor versions may
contain breaking changes — pin your version.** An upstream change taken in or a
hand-edit to a component's markup/props counts as a breaking change under that
policy, not a patch. Plugin authors should pin `plumix` and test their admin
chunk against each minor before upgrading.

## Conventions

**Destructive actions.** A standalone or primary destructive button (a delete
button, a confirm dialog's action) uses `<Button variant="destructive">`. The
two inline shapes are Button variants too:

- `variant="destructive-ghost"` — always red. For a destructive action sitting
  inline among non-destructive peers: a ghost action toolbar's Delete, a
  link-remove beside a URL field.
- `variant="destructive-row"` — muted until hovered, then red. For a
  destructive action repeated once per row — a sortable list item's remove, a
  row's Trash link — where a red control on every row would be noise.

Never spell a tint out in a `className`: `shadcn/no-restyle` rejects a colour
on a primitive, so the surfaces can't drift on what "destructive" looks like.
