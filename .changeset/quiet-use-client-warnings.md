---
"plumix": patch
---

Fixes `plumix build` printing a `MODULE_LEVEL_DIRECTIVE` warning for every `"use client"` module it bundles, including Radix, Lingui and the admin primitives. Plumix handles the directive itself, so the warning was noise. A site's own `build.rolldownOptions.onLog` still receives every other log.
