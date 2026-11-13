---
"plumix": minor
---

Adds a typed `viewport` group to the document manifest, so a theme, plugin, template or `render.document` filter can set `viewportFit`, `interactiveWidget` and the other viewport properties, plus `themeColor` and `colorScheme`. It merges field by field over the default `width=device-width, initial-scale=1`, and every page still renders exactly one viewport tag. A `meta` entry named `viewport`, `theme-color` or `color-scheme` now throws `DocumentManifestError`; move it to the matching `viewport` field.
