---
"@plumix/core": patch
---

Fixes an editor link (`?plumix.edit`) to a plugin route: a public route now renders it live with `private, no-store`, and a cacheable raw route no longer stores its response in the CDN.
