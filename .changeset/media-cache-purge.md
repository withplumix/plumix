---
"@plumix/plugin-media": patch
---

Fixes cached pages that show a media item staying stale after its title or alt text is edited, or after it is deleted: both now purge every cached page that showed a picture. Requires plumix 0.25.0.
