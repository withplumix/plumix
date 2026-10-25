---
"@plumix/plugin-feeds": patch
---

Adds the feed discovery links through the `render.document` filter rather than the removed `render:document` string filter, so the plugin needs `plumix` 0.27.0 or later. The links on each page are unchanged.
