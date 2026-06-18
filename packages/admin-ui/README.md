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
