---
"@plumix/plugin-media": patch
---

The library's thumbnail helper hands a relative media URL — what a disk-stored upload served through the plugin's own route has — to an `imageDelivery` slot that declares `acceptsRelativeSources`, so such uploads get thumbnails on the Node runtime. A slot without the flag still receives absolute URLs only.
