---
"plumix": patch
---

Fixes `plumix i18n extract` silently wiping a hand-authored `locales/*.po` catalog (the pattern `plugin-blog` and `plugin-pages` use for server-side descriptors Babel never sees) — it now refuses to run and points at `plumix i18n verify` instead.
