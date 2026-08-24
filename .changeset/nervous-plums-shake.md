---
"@plumix/blocks": minor
"@plumix/core": patch
---

Registers `core/html` with the rest of `coreBlocks`, so the raw-HTML block appears in the inserter
and renders without a site installing it by hand.

It was held out of `coreBlocks` when it had no sanitizer, on the understanding that a site wanting
the escape hatch would register it explicitly. That route stopped working: block registration rejects
any name in the reserved `core/` namespace, so neither a theme's `blocks` field nor a plugin's
`registerBlock` would take it, and the block shipped unreachable. The reason for holding it back is
also gone — it renders through `sanitizeHtml`, the same path `core/rich-text` already takes, so it
adds no rendering surface a site did not already have.

What survives sanitizing is the baseline allowlist: text-level markup and `http`/`https`/`mailto`/
`tel` anchors. `script`, `iframe`, `object`, `embed`, `style`, `link`, `meta`, `base`, `form`,
`input`, `textarea`, `button`, `svg` and `math` are denied outright and stay denied whatever a site
configures. Others, `img` among them, are simply absent from the baseline and can be added.

Two caveats worth knowing. There is no per-block disable, so a site that would rather not offer a
raw-HTML block has no switch for it. And `blocks.htmlAllowlist` does not currently reach the
renderer at all — everything sanitizes against the baseline until that is wired up.
