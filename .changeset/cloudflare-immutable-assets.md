---
"@plumix/runtime-cloudflare": patch
---

Fixes hashed build assets being served `max-age=0, must-revalidate` on Workers. `plumix build` now writes a `_headers` file that marks `/assets/*` and `/_plumix/admin/assets/*` immutable, followed by your own `public/_headers` rules unchanged, so a later `! Cache-Control` rule of yours can override it.
