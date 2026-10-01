---
"@plumix/plugin-menu": patch
---

Fixes menu items that link to an entry or term losing their label once the target is trashed: saving a menu now stores each item's last-known label and URL, so the editor still shows a broken item's name and "Convert to Custom URL" fills in its last address.
