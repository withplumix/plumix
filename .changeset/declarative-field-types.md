---
"@plumix/plugin-media": patch
"@plumix/plugin-og": patch
"@plumix/plugin-seo": patch
---

Declares the media, og and seo admin field types through `ctx.registerFieldType`, so they appear in the plugin manifest and register once from the synthesised admin chunk instead of an imperative call in each plugin's admin entry.
