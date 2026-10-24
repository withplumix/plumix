---
"plumix": minor
---

Adds `ctx.registerDocumentManifest(manifest)` for contributing document tags (title template, meta, link, script), and removes the `theme:document` filter. Core merges every registered manifest after the theme's own `document` once at boot, in plugin config order: `link`, `meta` and `script` append, `html` and `body` attributes merge by key with `className` concatenated, and `title`, `titleTemplate` and `canonical` take the last value set. An invalid tag still fails boot with the same document-manifest error. Move an `addFilter("theme:document", (manifest) => ({ ...manifest, meta: [...(manifest.meta ?? []), tag] }))` call to `registerDocumentManifest({ meta: [tag] })`.
