---
"@plumix/admin": patch
"plumix": patch
---

Deduplicate the admin's Tailwind `@theme` token mapping. `@plumix/admin` now
owns it as `theme.css` and ships it in `dist`; plumix's per-plugin CSS sidecar
reads it from the installed admin package instead of keeping its own hand-synced
copy. No public API change.
