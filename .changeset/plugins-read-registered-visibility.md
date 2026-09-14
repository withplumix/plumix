---
"@plumix/plugin-feeds": patch
"@plumix/plugin-seo": patch
"@plumix/plugin-og": patch
"@plumix/plugin-search": patch
"@plumix/plugin-menu": patch
---

Reads entry type and taxonomy visibility from the registered type, so these plugins now need the plumix release that resolves visibility at registration. On an older plumix they treat a type that never set `isPublic` as not public.
