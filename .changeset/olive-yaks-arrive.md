---
"@plumix/core": patch
"@plumix/blocks": patch
"@plumix/admin-editor": patch
---

Wires `blocks.htmlAllowlist` through to the renderer. An operator's `extraTags` / `extraAttributes`
now change what `core/html` and `core/rich-text` render, on the public page and in the editor canvas.

The allowlist was typed, documented, and built at boot, but nothing mounted `HtmlAllowlistProvider`,
so every render fell back to the context default — the baseline. Setting
`htmlAllowlist: { extraTags: ["img"] }` produced silence, not an image.

`HtmlAllowlistProvider` is the seam, mounted in both consumers. The public render mounts it from
`renderEnv.htmlAllowlist`, alongside the existing `PlumixProvider`. The editor canvas is a fresh
React tree inside an iframe with no server context, so the allowlist crosses the boundary the way
tokens and breakpoints already did: on the JSON embed the SSR emits next to the mount root, read back
at mount. Without that second mount the canvas would keep sanitizing against the baseline while the
published page used the operator's list, and an author would see their markup stripped in the editor
and intact on the site.

That embed is now `[data-plumix-render-env]` rather than `[data-plumix-style-env]` — it carries more
than styles. Nothing outside the editor runtime reads it, and the SSR and the runtime that reads it
ship together.

This lands alongside the three floor changesets in the same release: the denials in
`enforceHtmlFloors` are what an override cannot widen past, and they went in before anything could
reach the renderer through them.

`PlumixApp.htmlAllowlist` documented the missing step as `<EntryContent htmlAllowlist={...}>`.
`EntryContent` is an interface, not a component, so that seam never existed and could not be
followed; the field now describes the provider.
