---
"plumix": patch
---

Fixes `ShortcodeContext.siteSettings` and `BlockContext.siteSettings` always being empty: shortcodes and blocks now read the site's `site` settings group in entry titles, rich-text bodies, listings, og cards, the SERP preview and the editor canvas. `RenderBlockTreeOptions` and the renderer context gain an optional `siteSettings`.
