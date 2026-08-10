---
"@plumix/core": patch
---

Stop the dev error page from scrolling sideways on wide SQL or header values.

The context, plugin-panel, and executed-query lists on the `plumix dev` error
page rendered as bare `display: grid`, so their implicit column sized to
`max-content` — a long single-line `select … where (…)` query or a long
`accept` / `user-agent` header grew it past the viewport, scrolling the whole
page body sideways and clipping the content past each panel's right edge. Each
grid now pins its column to `minmax(0, 1fr)` (matching the stack/source and
hydration-diff grids), so wide content stays inside its own `overflow-x` / word
wrap block: SQL rows scroll within their block and header values wrap.
