---
"plumix": minor
---

Fixes the editor canvas showing different content from the page: it now renders with the page's locale and queried entry, and expands shortcodes in rich-text bodies instead of showing raw `[year]` source after first paint. Adds an optional `shortcodes` field to `definePlugin`, which registers them on the server and ships them to the editor canvas. A shortcode registered with `ctx.registerShortcode` still expands on the page, but the canvas shows its raw `[tag]` source. **Breaking:** `bootEditor` now takes an options object (`bootEditor({ blocks, shortcodes })`) in place of a block-spec array. The generated editor entry is rewritten on every build, so only a hand-written call needs updating.
