# @plumix/admin-ui

The shared shadcn/ui primitives rendered by the admin shell (`@plumix/admin`)
**and** by plugin admin chunks (via `plumix/admin/ui`). One vendored source of
truth so the shell and plugins stay visually consistent.

## Adding a component

```sh
pnpm --filter @plumix/admin-ui ui:add <component>   # e.g. dialog, badge
```

This runs `shadcn add` against this package's `components.json` (components
land flat in `src/`, `cn` imports resolve to `@plumix/admin-ui`) and formats
the result. After adding, export it from `src/index.ts` and add a subpath to
`exports` in `package.json` so consumers can `import … from
"@plumix/admin-ui/<component>"`.

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
vendored shadcn components we own and edit (via `ui:add`). It carries no
guarantee beyond plumix's repo-wide policy: **pre-1.0, minor versions may
contain breaking changes — pin your version.** A `ui:add` re-generation or a
hand-edit to a component's markup/props counts as a breaking change under that
policy, not a patch. Plugin authors should pin `plumix` and test their admin
chunk against each minor before upgrading.

## Conventions

**Destructive actions.** A standalone or primary destructive button (a delete
button, a confirm dialog's action) uses `<Button variant="destructive">`. A
destructive action sitting inline among non-destructive peers (a ghost action
toolbar, a per-row "Remove") uses `variant="ghost"` plus the shared
`destructiveGhostClassName` — never a hand-rolled `text-destructive` string, so
the surfaces can't drift on what "destructive" looks like.
