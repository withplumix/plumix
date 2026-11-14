---
"plumix": patch
---

Fixes the admin's hashed bundles under `/_plumix/admin/assets/` being served with no `Cache-Control` on Node and Bun. They are now `public, max-age=31536000, immutable`, like `/assets/`. Adds `HASHED_ASSET_PREFIXES` to `plumix/runtime`, the URL prefixes of content-hashed build output.
